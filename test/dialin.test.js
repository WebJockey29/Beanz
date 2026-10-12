import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalisedTime,
  targetTime,
  recommend,
  learnFromHistory,
  startingSetting,
  fitBag,
  predictionLog,
} from '../src/dialin.js';

// A simulated grinder: t36 = base - k * setting, plus optional noise.
const simulate = (base, k, settings, noise = []) =>
  settings.map((setting, i) => ({ setting, dose: 18, time: base - k * setting + (noise[i] ?? 0), yield: 36 }));

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
  assert.equal(targetTime('sour', null, { tasteShift: 10 }), 30);
});

test('fast shot -> go finer', () => {
  const r = recommend([{ setting: 6, dose: 18, time: 18, yield: 36 }]);
  assert.equal(r.status, 'fast');
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

test('bag k moves toward the truth with every reading', () => {
  // Real grinder: 5 s per step. Starting guess is 3.
  const shots = simulate(52, 5, [7, 5, 6, 4, 5, 6]);
  const ks = [];
  for (let n = 2; n <= shots.length; n++) ks.push(fitBag(shots.slice(0, n)).k);
  for (let i = 1; i < ks.length; i++) assert.ok(ks[i] >= ks[i - 1] - 1e-9, `k should not regress: ${ks}`);
  assert.ok(ks.at(-1) > 4.3, `k should approach 5, got ${ks.at(-1)}`);
});

test('prediction error shrinks as readings accumulate', () => {
  const shots = simulate(52, 5, [7, 5, 6, 4, 5, 6, 5]);
  const log = predictionLog(shots);
  assert.ok(Math.abs(log[0].error) > 3, 'first prediction uses the starting guess');
  assert.ok(Math.abs(log.at(-1).error) < 0.5, `later prediction is close: ${log.at(-1).error}`);
});

test('one channeled shot does not wreck the fit', () => {
  const clean = simulate(52, 5, [7, 5, 6, 4]);
  const noisy = simulate(52, 5, [7, 5, 6, 4], [0, 0, -12, 0]);
  assert.ok(Math.abs(fitBag(noisy).k - fitBag(clean).k) < 1.5);
});

test('history from earlier bags carries the machine k into a new bag', () => {
  const old = [
    { roast: 'medium', shots: simulate(50, 5, [6, 4, 5]) },
    { roast: 'medium', shots: simulate(48, 5, [5, 3, 4]) },
  ];
  const h = learnFromHistory(old);
  assert.ok(h.secondsPerStep > 4.3, `machine k learned: ${h.secondsPerStep}`);
  // New bag, one shot 10 s fast: with k~5 that's 2 steps, not 3 as the guess would say.
  const r = recommend([{ setting: 6, dose: 18, time: 17.5, yield: 36 }], h);
  assert.equal(r.setting, 4);
  assert.equal(r.sensitivitySource, 'history');
});

test('learns your preferred shot time from balanced ratings', () => {
  const bag = {
    roast: 'medium',
    shots: [29, 29.5, 29, 29.5, 29].map((time) => ({ setting: 5, time, yield: 36, taste: 'balanced' })),
  };
  const h = learnFromHistory([bag]);
  assert.ok(h.preferredTime > 28.5 && h.preferredTime <= 30);
  assert.equal(targetTime(undefined, h), h.preferredTime);
});

test('starting setting learned per roast, with offsets as fallback', () => {
  const dialed = (roast, setting) => ({
    roast,
    shots: [{ setting, time: 27.5, yield: 36, taste: 'balanced' }],
  });
  const h = learnFromHistory([dialed('medium', 4), dialed('medium', 6), dialed('light', 2)]);
  assert.equal(startingSetting('light', h), 2);
  assert.equal(startingSetting('medium', h), 5);
  // No dark bags yet: medium-equivalent median (3, 4, 6 -> 4) + 1.
  assert.equal(startingSetting('dark', h), 5);
  assert.equal(startingSetting('dark', null), 6);
});

test('suggests inner burr change when out of range', () => {
  const r = recommend([{ setting: 1, dose: 18, time: 12, yield: 36 }]);
  assert.equal(r.setting, 1);
  assert.ok(r.notes.some((n) => n.includes('inner burr')));
});

test('no shots -> no recommendation', () => {
  assert.equal(recommend([]), null);
});
