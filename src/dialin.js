// Dial-in algorithm for espresso on a Sage/Breville Barista Express.
//
// The model learns at two levels (see README for the reasoning):
//
//   Machine / you  - carried across every bag and refined with every shot:
//     * k: seconds of shot time one grind step removes. Pooled from the
//       within-bag differences of every shot ever logged (each bag gets its own
//       intercept, so different beans don't confuse the slope).
//     * your preferred shot time, from shots you rated "balanced".
//     * where new bags tend to end up on the dial, per roast level.
//
//   This bag of beans - starts fresh with each new bag:
//     * the intercept (how fast these beans run), and a bag-specific k that
//       starts at the machine k and drifts toward what this bag shows.
//
// Every estimate is a precision-weighted blend of a prior and the data, so the
// prior fades as readings accumulate and predictions tighten with each shot.

export const DEFAULTS = {
  dose: 18, // g in
  ratio: 2, // 1:2 -> 36 g out
  timeMin: 25, // s
  timeMax: 30, // s
  // Seconds from pressing the button to steady flow (pre-infusion + first drips).
  // Yield accumulates roughly linearly after this, so we only scale this part.
  flowDelay: 6,
  secondsPerStep: 3, // starting belief for the outer grind dial
  // Prior strengths, in "step²" units (two shots one step apart add 0.5,
  // two shots two steps apart add 2). Higher = trust the prior longer.
  machinePriorStrength: 2,
  beanVariation: 6, // how much beans can differ from the machine-wide k
  preferencePriorShots: 3,
  robustCutoff: 4, // s; residuals beyond this get down-weighted (channeling etc.)
  minK: 0.5,
  maxK: 12,
  minSetting: 1,
  maxSetting: 16,
  defaultStart: 5, // Breville's recommended starting point
  tasteShift: 2, // s added/removed from the target time for sour/bitter
  recencyHalfLife: 2, // shots; newer shots anchor the prediction more (beans age)
};

const ROAST_OFFSET = { light: -1, medium: 0, dark: 1 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => Math.round(x * 10) / 10;
const withDefaults = (opts) => ({ ...DEFAULTS, ...opts });

/** Time the shot would have taken to reach dose * ratio grams. */
export function normalisedTime(shot, opts) {
  const o = withDefaults(opts);
  const { time, yield: out } = shot;
  const dose = shot.dose ?? o.dose;
  if (!(time > 0) || !(out > 0)) return null;
  const targetYield = dose * o.ratio;
  const delay = Math.min(o.flowDelay, time * 0.5);
  return delay + (time - delay) * (targetYield / out);
}

function toPoints(shots, o) {
  return shots
    .map((s) => ({ setting: Number(s.setting), t: normalisedTime(s, o), shot: s }))
    .filter((p) => p.t !== null && Number.isFinite(p.setting));
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Weighted within-bag sums for the slope. Returns sxy (time saved per step,
 * summed) and sxx (spread of settings), after one robust re-weighting pass so a
 * single channeled shot can't drag the slope.
 */
function slopeSums(points, kGuess, o) {
  if (points.length < 2) return { sxy: 0, sxx: 0, weights: points.map(() => 1) };
  let weights = points.map(() => 1);
  let sums;
  for (let pass = 0; pass < 2; pass++) {
    const W = weights.reduce((a, b) => a + b, 0);
    const ms = points.reduce((a, p, i) => a + weights[i] * p.setting, 0) / W;
    const mt = points.reduce((a, p, i) => a + weights[i] * p.t, 0) / W;
    let sxy = 0;
    let sxx = 0;
    points.forEach((p, i) => {
      sxy -= weights[i] * (p.setting - ms) * (p.t - mt);
      sxx += weights[i] * (p.setting - ms) ** 2;
    });
    sums = { sxy, sxx, ms, mt };
    if (pass === 0) {
      const k = sxx > 0 ? clamp(sxy / sxx, o.minK, o.maxK) : kGuess;
      weights = points.map((p) => {
        const r = Math.abs(p.t - (mt - k * (p.setting - ms)));
        return r <= o.robustCutoff ? 1 : o.robustCutoff / r;
      });
    }
  }
  return { ...sums, weights };
}

/** Did this bag reach a good shot? Returns that shot's setting or null. */
function dialedSetting(points, o) {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    const taste = p.shot.taste;
    if (p.t >= o.timeMin && p.t <= o.timeMax && taste !== 'sour' && taste !== 'bitter') {
      return p.setting;
    }
  }
  return null;
}

/**
 * Machine/user-level knowledge learned from previous bags.
 * Pass every bag except the one being dialed in.
 */
export function learnFromHistory(bags, opts) {
  const o = withDefaults(opts);
  let sxy = 0;
  let sxx = 0;
  let shotCount = 0;
  const balanced = [];
  const finals = { all: [], light: [], medium: [], dark: [] };

  for (const bag of bags) {
    const pts = toPoints(bag.shots ?? [], o);
    shotCount += pts.length;
    const s = slopeSums(pts, o.secondsPerStep, o);
    sxy += s.sxy;
    sxx += s.sxx;
    for (const p of pts) if (p.shot.taste === 'balanced') balanced.push(p.t);
    const final = dialedSetting(pts, o);
    if (final !== null) {
      // Store as a medium-roast equivalent so roasts can share information.
      finals.all.push(final - (ROAST_OFFSET[bag.roast] ?? 0));
      if (finals[bag.roast]) finals[bag.roast].push(final);
    }
  }

  const tau = o.machinePriorStrength;
  const k = clamp((tau * o.secondsPerStep + sxy) / (tau + sxx), o.minK, o.maxK);

  const mid = (o.timeMin + o.timeMax) / 2;
  const n0 = o.preferencePriorShots;
  const preferredTime = clamp(
    (n0 * mid + balanced.reduce((a, b) => a + b, 0)) / (n0 + balanced.length),
    o.timeMin,
    o.timeMax,
  );

  const startByRoast = {};
  for (const roast of Object.keys(ROAST_OFFSET)) {
    if (finals[roast].length) startByRoast[roast] = Math.round(median(finals[roast]));
    else if (finals.all.length) startByRoast[roast] = Math.round(median(finals.all) + ROAST_OFFSET[roast]);
  }

  return {
    secondsPerStep: k,
    kEvidence: tau + sxx, // precision of k, grows with every informative shot
    preferredTime,
    balancedCount: balanced.length,
    startByRoast,
    bagCount: bags.length,
    shotCount,
  };
}

/** Suggested first setting for a new bag. */
export function startingSetting(roast, history, opts) {
  const o = withDefaults(opts);
  const learned = history?.startByRoast?.[roast];
  const start = learned ?? o.defaultStart + (ROAST_OFFSET[roast] ?? 0);
  return clamp(start, o.minSetting, o.maxSetting);
}

/** Target time for the next shot: your learned sweet spot, shifted by taste. */
export function targetTime(taste, history, opts) {
  const o = withDefaults(opts);
  const base = history?.preferredTime ?? (o.timeMin + o.timeMax) / 2;
  const shift = taste === 'sour' ? o.tasteShift : taste === 'bitter' ? -o.tasteShift : 0;
  return clamp(base + shift, o.timeMin, o.timeMax);
}

/** Fit the current bag: bag-specific k (shrunk to the machine k) and an anchor. */
export function fitBag(shots, history, opts) {
  const o = withDefaults(opts);
  const points = toPoints(shots, o);
  if (!points.length) return null;

  const kMachine = history?.secondsPerStep ?? o.secondsPerStep;
  const machinePrecision = history?.kEvidence ?? o.machinePriorStrength;
  // Prior on this bag's k = machine k, with uncertainty from both the machine
  // estimate and genuine bean-to-bean differences.
  const tauBag = 1 / (1 / machinePrecision + 1 / o.beanVariation);
  const s = slopeSums(points, kMachine, o);
  const k = clamp((tauBag * kMachine + s.sxy) / (tauBag + s.sxx), o.minK, o.maxK);

  // Anchor: project each shot along the line to the latest setting, then average
  // with recency and robustness weights.
  const last = points[points.length - 1];
  let wsum = 0;
  let anchorT = 0;
  points.forEach((p, i) => {
    const age = points.length - 1 - i;
    const w = 0.5 ** (age / o.recencyHalfLife) * s.weights[i];
    anchorT += w * (p.t - k * (last.setting - p.setting));
    wsum += w;
  });
  anchorT /= wsum;

  return {
    k,
    kSource:
      s.sxx > 0
        ? history?.shotCount ? 'this bag + history' : 'this bag'
        : history?.shotCount ? 'history' : 'starting guess',
    anchorSetting: last.setting,
    anchorT,
    points,
    last,
  };
}

/** Predicted time-to-target-yield at a given setting. */
export function predictTime(fit, setting) {
  return fit.anchorT - fit.k * (setting - fit.anchorSetting);
}

/**
 * For each shot after the first in a bag, what the model would have predicted
 * before seeing it. This shows how much more accurate the model gets.
 */
export function predictionLog(shots, history, opts) {
  const o = withDefaults(opts);
  const log = [];
  for (let i = 1; i < shots.length; i++) {
    const actual = normalisedTime(shots[i], o);
    const fit = fitBag(shots.slice(0, i), history, o);
    if (actual === null || !fit) continue;
    const predicted = predictTime(fit, Number(shots[i].setting));
    log.push({ index: i, predicted: round1(predicted), actual: round1(actual), error: round1(actual - predicted) });
  }
  return log;
}

/**
 * Recommend the next grind setting for a bag.
 * @param shots chronological [{setting, dose, time, yield, taste}]
 * @param history result of learnFromHistory() over the other bags (optional)
 */
export function recommend(shots, history, opts) {
  const o = withDefaults(opts);
  const fit = fitBag(shots, history, o);
  if (!fit) return null;

  const { last, k } = fit;
  const target = targetTime(last.shot.taste, history, o);
  const exact = fit.anchorSetting + (fit.anchorT - target) / k;
  const rounded = Math.round(exact);
  const setting = clamp(rounded, o.minSetting, o.maxSetting);

  const notes = [];
  const dose = last.shot.dose ?? o.dose;
  const inWindow = last.t >= o.timeMin && last.t <= o.timeMax;
  const tasteOk = !last.shot.taste || last.shot.taste === 'balanced';

  let status;
  if (inWindow && tasteOk) status = 'dialed';
  else if (last.t < o.timeMin) status = 'fast';
  else if (last.t > o.timeMax) status = 'slow';
  else status = 'taste';

  if (Math.abs(dose - o.dose) >= 0.5) {
    notes.push(`Dose was ${dose} g. Keep it at ${o.dose} g so grind is the only thing changing.`);
  }
  if (rounded < o.minSetting) {
    notes.push('Even the finest outer setting is predicted to run fast. Move the inner burr one step finer, then restart at 5.');
  } else if (rounded > o.maxSetting) {
    notes.push('Even the coarsest outer setting is predicted to run slow. Move the inner burr one step coarser, then restart at 5.');
  }
  if (last.shot.time < 15 && last.setting <= 3) {
    notes.push('Very fast at a fine setting usually means channeling. Check dose, distribution and tamp.');
  }
  if (Math.abs(last.shot.yield - dose * o.ratio) > 8) {
    notes.push(`Stop the shot nearer ${dose * o.ratio} g. Estimates get less accurate the further you are from target.`);
  }
  if (status === 'dialed' && setting !== last.setting) {
    notes.push('Within target, so the setting stays put. Change it only if the taste is off.');
  }

  const finalSetting = status === 'dialed' ? last.setting : setting;
  return {
    status,
    setting: finalSetting,
    change: finalSetting - last.setting,
    exactSetting: round1(exact),
    predictedTime: round1(status === 'dialed' ? last.t : predictTime(fit, finalSetting)),
    lastNormalisedTime: round1(last.t),
    targetTime: round1(target),
    secondsPerStep: round1(k),
    sensitivitySource: fit.kSource,
    notes,
  };
}
