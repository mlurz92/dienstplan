import test from 'node:test';
import assert from 'node:assert/strict';

const controls = await import('../js/ui-controls.js');

test('office ribbon assigns every product action exactly once', () => {
  assert.ok(Array.isArray(controls.OFFICE_RIBBON_TABS), 'OFFICE_RIBBON_TABS fehlt');

  const ids = controls.OFFICE_RIBBON_TABS.flatMap(tab => tab.groups.flatMap(group => group.items));
  const expected = [
    'absenceManagerBtn',
    'autoPlanBtn',
    'clearMonthBtn',
    'excelImportInput',
    'exportExcelBtn',
    'exportJsonBtn',
    'exportPdfBtn',
    'jsonImportInput',
    'preferenceManagerBtn',
    'reloadBtn',
    'settingsBtn',
    'todayBtn'
  ];

  assert.deepEqual([...ids].sort(), expected);
  assert.equal(new Set(ids).size, ids.length);
});

test('unknown actions resolve to the start ribbon tab', () => {
  assert.equal(typeof controls.ribbonTabForAction, 'function', 'ribbonTabForAction fehlt');
  assert.equal(controls.ribbonTabForAction('unknownAction'), 'home');
});

test('auto plan resolves to its dedicated ribbon tab', () => {
  assert.equal(typeof controls.ribbonTabForAction, 'function', 'ribbonTabForAction fehlt');
  assert.equal(controls.ribbonTabForAction('autoPlanBtn'), 'auto-plan');
});
