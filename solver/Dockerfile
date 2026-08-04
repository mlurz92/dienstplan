FROM python:3.13.7-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

RUN groupadd --system solver && useradd --system --gid solver --home-dir /app solver
WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY app /app/app
RUN python -m pip install --upgrade pip==25.2 \
    && python -m pip install . \
    && chown -R solver:solver /app

USER solver
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
