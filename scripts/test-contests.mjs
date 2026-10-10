// Pins the contests chart promises: the empty state is honest text with no marks, and populated rows
// give one accent dot each with a "top N%" tooltip. Placeholder rows must never become marks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContestsSvg, contestsLabel } from '../src/figures/contests/figure.js';

const size = { width: 640, height: 400 };
const EMPTY = 'Contest results go here. Add them to contests in src/content.js.';

test('empty rows show the empty state and no circles', () => {
  const svg = buildContestsSvg([], size);
  assert.ok(svg.includes(EMPTY));
  assert.ok(!svg.includes('<circle'));
});

test('two rows give two circles, a year axis and per-mark titles', () => {
  const svg = buildContestsSvg(
    [{ name: 'A', year: 2024, percentile: 92.5 }, { name: 'B', year: 2025, percentile: 71 }],
    size,
  );
  assert.equal((svg.match(/<circle/g) || []).length, 2);
  assert.ok(svg.includes('>2024<') && svg.includes('>2025<'));
  assert.ok(svg.includes('<title>A, 2024: top 7.5%</title>'));
  assert.ok(svg.includes('<title>B, 2025: top 29%</title>'));
});

test('placeholder and percentile-less rows are ignored', () => {
  const svg = buildContestsSvg(
    [{ name: 'X', year: '[TODO]', result: 'r', placeholder: true }, { name: 'Y', year: 2024 }],
    size,
  );
  assert.ok(svg.includes(EMPTY));
  assert.ok(!svg.includes('<circle'));
});

test('contestsLabel: empty says no results, populated lists each mark', () => {
  assert.equal(contestsLabel([]), 'A dot plot of contest placements by year. No results have been added yet.');
  assert.equal(
    contestsLabel([{ name: 'A', year: 2024, percentile: 92.5 }, { name: 'B', year: 2025, percentile: 71 }]),
    'Dot plot of contest placement by year. A, 2024: top 7.5%. B, 2025: top 29%.',
  );
});

test('rows with a non-numeric year are ignored (no NaN marks)', () => {
  const rows = [{ name: 'Z', year: '[TODO: year]', percentile: 80 }];
  const svg = buildContestsSvg(rows, size);
  assert.ok(!svg.includes('NaN') && !svg.includes('<circle'));
  assert.equal(contestsLabel(rows), 'A dot plot of contest placements by year. No results have been added yet.');
});
