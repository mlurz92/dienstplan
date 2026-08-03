import test from 'node:test';
import assert from 'node:assert/strict';

import { TOOLBAR_GROUPS, visiblePaletteName, visiblePaletteTooltip } from '../js/ui-controls.js';

test('palette badge shows only the curated base color name', () => {
  assert.equal(visiblePaletteName('Monatskontrast · Eisnebel · Cloud Veil'), 'Eisnebel');
  assert.equal(visiblePaletteName('Rubinrose · Quiet Luxury'), 'Rubinrose');
  assert.equal(visiblePaletteName('Monatskontrast · Tannengrün'), 'Tannengrün');
  assert.equal(visiblePaletteName(''), '');
});

test('palette tooltip keeps season, family and year but hides the edition label', () => {
  assert.equal(
    visiblePaletteTooltip('Winter · Frost · Edition Cloud Veil · 2026'),
    'Winter · Frost · 2026'
  );
  assert.equal(
    visiblePaletteTooltip('Herbst · Erde · Edition Organic Modern · 2036'),
    'Herbst · Erde · 2036'
  );
});

test('toolbar groups follow the Excel ribbon information architecture', () => {
  assert.deepEqual(
    TOOLBAR_GROUPS.map(group => group.key),
    ['open', 'output', 'home', 'planning', 'auto-plan', 'data', 'application']
  );
  const items = TOOLBAR_GROUPS.flatMap(group => group.items);
  assert.equal(items.length, 12);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  assert.ok(items.every(item => item.icon && item.label && item.shortLabel));
  assert.deepEqual(
    TOOLBAR_GROUPS.map(group => group.items.length),
    [2, 3, 3, 1, 1, 1, 1]
  );
});
