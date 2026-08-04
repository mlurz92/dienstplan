from __future__ import annotations

import asyncio
import json
import queue
import threading
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import orjson
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import ORJSONResponse, StreamingResponse
from pydantic import ValidationError

from .schemas import SolverSnapshot
from .solver import solve_snapshot

app = FastAPI(
    title="DienstplanRAD Auto-Plan v9 Solver",
    version="0.9.0",
    default_response_class=ORJSONResponse,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@dataclass(slots=True)
class ActiveRun:
    cancel: threading.Event
    started_at: float


_ACTIVE_RUNS: dict[str, ActiveRun] = {}
_ACTIVE_RUNS_LOCK = threading.Lock()
_MAX_REQUEST_BYTES = 2_000_000


def _put_run(run_id: str, run: ActiveRun) -> None:
    with _ACTIVE_RUNS_LOCK:
        _ACTIVE_RUNS[run_id] = run


def _pop_run(run_id: str) -> None:
    with _ACTIVE_RUNS_LOCK:
        _ACTIVE_RUNS.pop(run_id, None)


def _cancel_run(run_id: str) -> bool:
    with _ACTIVE_RUNS_LOCK:
        run = _ACTIVE_RUNS.get(run_id)
        if run is None:
            return False
        run.cancel.set()
        return True


def _ndjson(message: dict[str, Any]) -> bytes:
    return orjson.dumps(message) + b"\n"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "autoplan-v9-solver"}


@app.post("/cancel")
def cancel(x_run_id: str = Header(default="", alias="X-Run-Id")) -> dict[str, object]:
    if not x_run_id:
        raise HTTPException(status_code=400, detail="X-Run-Id missing")
    return {"ok": True, "runId": x_run_id, "cancelled": _cancel_run(x_run_id)}


async def _parse_snapshot(request: Request) -> SolverSnapshot:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > _MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Snapshot too large")
    body = await request.body()
    if len(body) > _MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Snapshot too large")
    try:
        payload = json.loads(body)
        return SolverSnapshot.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(status_code=400, detail=f"Invalid v9 snapshot: {error}") from error


@app.post("/solve-stream", response_class=StreamingResponse)
async def solve_stream(
    request: Request,
    x_run_id: str = Header(default="", alias="X-Run-Id"),
) -> StreamingResponse:
    snapshot = await _parse_snapshot(request)
    run_id = x_run_id or f"v9-{snapshot.requestFingerprint}"
    cancel_event = threading.Event()
    run = ActiveRun(cancel=cancel_event, started_at=time.monotonic())
    _put_run(run_id, run)
    messages: queue.Queue[dict[str, Any] | None] = queue.Queue(maxsize=2048)

    def emit(event: dict[str, object]) -> None:
        if cancel_event.is_set():
            return
        try:
            messages.put_nowait({"type": "event", "event": event})
        except queue.Full:
            # Keep the latest semantic event without blocking CP-SAT. The
            # Durable Object persists all events it actually receives.
            try:
                messages.get_nowait()
            except queue.Empty:
                pass
            messages.put_nowait({"type": "event", "event": event})

    def work() -> None:
        try:
            result = solve_snapshot(snapshot, emit, cancel_event)
            if cancel_event.is_set():
                messages.put({"type": "error", "error": "Solver run cancelled."})
            else:
                messages.put({"type": "result", "result": result.model_dump(mode="json")})
        except Exception as error:  # noqa: BLE001 - converted to controlled stream error
            messages.put({"type": "error", "error": f"{type(error).__name__}: {error}"})
        finally:
            messages.put(None)

    thread = threading.Thread(target=work, name=f"solver-{run_id[:32]}", daemon=True)
    thread.start()

    async def stream() -> AsyncIterator[bytes]:
        try:
            while True:
                if await request.is_disconnected():
                    cancel_event.set()
                    break
                item = await asyncio.to_thread(messages.get)
                if item is None:
                    break
                yield _ndjson(item)
        finally:
            cancel_event.set()
            _pop_run(run_id)

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Run-Id": run_id,
        },
    )
