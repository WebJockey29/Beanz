import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisedTime,
  targetTime,
  estimateSensitivity,
  recommend,
  learnFromHistory,
  startingSetting,
} from '../src/dialin.js';

test('normalisedTime leaves an on-target shot unchanged', () => {
  assert.equal(normalisedTime({ dose: 18, time: 28, yield: 36 }), 28);
});

test('normalisedTime extends a shot that was stopped early', () => {
  // 18 g out in 20 s -> after the 6 s delay, 14 s for 18 g, so ~28 s more for 36 g.
  assert.equal(normalisedTime({ dose: 18, time: 20, yield: 18 }), 34);
});

test('normalisedTime rejects missing data', () => {
  assert.equal(normalisedTime({ time: 0, yield: 36 }), null);
  assert.equal(normalisedTime({ time: 25, yield: 0 }), null);
});

test('targetTime shifts with taste and stays in the window', () => {
  assert.equal(targetTime(undefined), 27.5);
  assert.equal(targetTime('sour'), 29.5);
  assert.equal(targetTime('bitter'), 25.5);
  assert.equal(targetTime('sour', { tasteShift: 10 }), 30);
});

test('fast shot -> go finer', () => {
  const r = recommend([{ setting: 6, dose: 18, time: 18, yield: 36 }]);
  assert.equal(r.status, 'fast');
  assert.ok(r.setting < 6);
  // (18 - 27.5) / 3 = -3.17 -> 3 steps finer
  assert.equal(r.setting, 3);
});

test('slow shot -> go coarser', () => {
  const r = recommend([{ setting: 3, dose: 18, time: 37, yield: 36 }]);
  assert.equal(r.status, 'slow');
  assert.equal(r.setting, 6);
});

test('dialed-in shot keeps the setting', () => {
  const r = recommend([{ setting: 5, dose: 18, time: 27, yield: 36, taste: 'balanced' }]);
  assert.equal(r.status, 'dialed');
  assert.equal(r.change, 0);
});

test('sour shot in the window nudges finer', () => {
  const r = recommend([{ setting: 5, dose: 18, time: 26, yield: 36, taste: 'sour' }]);
  assert.equal(r.status, 'taste');
  assert.equal(r.setting, 4);
});

test('learns a steeper sensitivity from the bag', () => {
  // Real grinder: 5 s per step. Prior says 3.
  const shots = [
    { setting: 7, dose: 18, time: 17, yield: 36 },
    { setting: 5, dose: 18, time: 27, yield: 36 },
    { setting: 6, dose: 18, time: 22, yield: 36 },
  ];
  const est = estimateSensitivity(shots.map((s) => ({ setting: s.setting, t: s.time })));
  assert.equal(est.fitted, 5);
  assert.ok(est.k > 3 && est.k < 5);
  const r = recommend(shots);
  assert.equal(r.setting, 5);
});

test('rejects nonsense fits (time rising with coarser grind)', () => {
  const est = estimateSensitivity([
    { setting: 4, t: 20 },
    { setting: 6, t: 30 },
  ]);
  assert.equal(est.source, 'prior (fit rejected)');
  assert.equal(est.k, 3);
});

test('suggests inner burr change when out of range', () => {
  const r = recommend([{ setting: 1, dose: 18, time: 12, yield: 36 }]);
  assert.equal(r.setting, 1);
  assert.ok(r.notes.some((n) => n.includes('inner burr')));
});

test('history sets starting point and sensitivity', () => {
  const bag = (k, final) => ({
    shots: [
      { setting: final + 2, time: 27.5 - 2 * k, yield: 36 },
      { setting: final, time: 27.5, yield: 36 },
    ],
  });
  const h = learnFromHistory([bag(4, 4), bag(4, 6), bag(4, 5)]);
  assert.equal(h.secondsPerStep, 4);
  assert.equal(h.startSetting, 5);
  assert.equal(startingSetting('light', h), 4);
  assert.equal(startingSetting('dark', h), 6);
});

test('no shots -> no recommendation', () => {
  assert.equal(recommend([]), null);
});
