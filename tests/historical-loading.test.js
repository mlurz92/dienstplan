import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyMonth } from '../js/defaults.js';
globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};
const {api}=await import('../js/api.js?v=20260803.4');
const {state,warmAdjacentMonths}=await import('../js/state.js');
test('history load',async()=>{const original=api.getMonth;const calls=[];state.months.clear();state.serverReady=true;api.getMonth=async(y,m)=>{calls.push([y,m]);return {month:createEmptyMonth(y,m)}};try{await warmAdjacentMonths(2026,7)}finally{api.getMonth=original}assert.deepEqual(calls.sort((a,b)=>a[1]-b[1]),[[2026,1],[2026,2],[2026,3],[2026,4],[2026,5],[2026,6],[2026,8]]);assert.equal(state.serverReady,true)});
