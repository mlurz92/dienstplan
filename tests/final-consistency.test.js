import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyMonth, normalizeBackupPayload, normalizeStaffList } from '../js/defaults.js';
import { getEffectiveAbsence, getPlanningStaff, isAaOn, setAssignment } from '../js/rules-core.js';
import { evaluateCandidate } from '../js/rules-evaluation.js';
import { onRequestGet as exportBackup } from '../functions/api/export.js';
import { onRequestPost as importBackup } from '../functions/api/import.js';

const staff = normalizeStaffList([
  { id:'lurz', name:'Dr. Lurz', includeInPlanning:true, includeInAbsenceList:true, activeFrom:'2025-01-01', bdTarget:1, canHg:true, canSaturdayBd:true },
  { id:'becker', name:'Dr. Becker', includeInPlanning:true, includeInAbsenceList:true, activeFrom:'2025-01-01', bdTarget:1, canHg:true, canSaturdayBd:true },
  { id:'neu', name:'Dr. Neu', includeInPlanning:true, includeInAbsenceList:true, activeFrom:'2025-01-01', bdTarget:1, canHg:true, canSaturdayBd:true }
], { strict:true });

function makeState(months) {
  return { staff, months:new Map(months), monthSources:new Map(months.map(([key]) => [key,'server'])), currentYear:2026, currentMonth:8 };
}

test('abgeleitetes Becker-FZA ist ein echter dienstfreier Tag für BD und HG', () => {
  const july = createEmptyMonth(2026,7);
  const august = createEmptyMonth(2026,8);
  setAssignment(august,'2026-08-01','bd','becker');
  const state = makeState([['2026-07',july],['2026-08',august]]);
  assert.equal(getEffectiveAbsence(state,august,'becker','2026-08-03'),'fza');
  const evaluation = evaluateCandidate({ state, monthData:august, dateIso:'2026-08-03', role:'hg', staffId:'becker' });
  assert.equal(evaluation.level,'red');
  assert.ok(evaluation.reasons.includes('FZA/Frei eingetragen'));
});

test('zusätzliche valide Personen erscheinen nach der Kernreihenfolge', () => {
  assert.deepEqual(getPlanningStaff(staff,'2026-08-03').map(person => person.id), ['lurz','becker','neu']);
});

test('unbekannte Personal-ID wird nicht als Assistenzarzt klassifiziert', () => {
  const state = makeState([['2026-08',createEmptyMonth(2026,8)]]);
  assert.equal(isAaOn(state,'nicht-vorhanden','2026-08-03'),false);
});

test('Jahresverlauf ignoriert vorgeplante Folgemonate', () => {
  const months = [];
  for (let month=1; month<=8; month+=1) months.push([`2026-${String(month).padStart(2,'0')}`,createEmptyMonth(2026,month)]);
  months[6][1].days['2026-07-01'].bd='lurz';
  months[7][1].days['2026-08-05'].bd='becker';
  const state = makeState(months);
  state.currentMonth=7;
  const evaluation=evaluateCandidate({ state, monthData:months[6][1], dateIso:'2026-07-10', role:'bd', staffId:'lurz' });
  assert.equal(evaluation.meta.historicalServices,1);
});

test('Fallback-Vormonat gilt nicht als vollständige Historie', () => {
  const months=[];
  for (let month=1; month<=7; month+=1) months.push([`2026-${String(month).padStart(2,'0')}`,createEmptyMonth(2026,month)]);
  const state=makeState(months);
  state.currentMonth=7;
  state.monthSources.set('2026-03','fallback');
  const evaluation=evaluateCandidate({ state, monthData:months[6][1], dateIso:'2026-07-10', role:'bd', staffId:'lurz' });
  assert.equal(evaluation.reasons.some(reason => reason.startsWith('Jahresverlauf:')),false);
});

test('Backupvalidierung weist doppelte Monate und defektes Personal zurück', () => {
  assert.throws(() => normalizeBackupPayload({ months:[['2026-07',{}],['2026-07',{}]] }),/doppelt/);
  assert.throws(() => normalizeBackupPayload({ staff:[null] }),/Personal-Eintrag/);
});

test('Export listet dynamisch Monate nach 2030', async () => {
  const values=new Map([
    ['app:settings',JSON.stringify({schemaVersion:2})],['app:staff',JSON.stringify(staff)],['app:rbn-names',JSON.stringify([])],
    ['year:2031:month:01',JSON.stringify(createEmptyMonth(2031,1))]
  ]);
  const context={env:{DIENSTPLAN_KV:{
    get:async(key,type)=>{const value=values.get(key)??null;return type==='json'&&value?JSON.parse(value):value;},
    put:async(key,value)=>values.set(key,value),
    list:async()=>({keys:[{name:'year:2031:month:01'}],list_complete:true})
  }}};
  const payload=await (await exportBackup(context)).json();
  assert.equal(payload.months[0][0],'2031-01');
});

test('Serverimport rollt bei KV-Fehler zurück', async () => {
  const values=new Map([['app:settings',JSON.stringify({schemaVersion:1})],['app:staff',JSON.stringify(staff)]]);
  let writes=0;
  const store={
    get:async key=>values.get(key)??null,
    put:async(key,value)=>{writes+=1;if(writes===2)throw new Error('simulierter KV-Ausfall');values.set(key,value);},
    delete:async key=>values.delete(key)
  };
  const context={request:new Request('https://example.test/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:{schemaVersion:2},staff})}),env:{DIENSTPLAN_KV:store}};
  const response=await importBackup(context);
  assert.equal(response.status,500);
  assert.deepEqual(JSON.parse(values.get('app:settings')),{schemaVersion:1});
});
