// Dial-in algorithm for espresso on a Sage/Breville Barista Express.
//
// Approach (see README for the reasoning):
//   1. Normalise every shot to "time it would have taken to hit the target
//      yield", so shots stopped at different weights are comparable.
//   2. Model shot time as linear in the grind dial: t(s) = a - k * s, where k is
//      the seconds a single dial step removes. k starts from a prior (~3 s/step)
//      and is re-estimated per bag by least squares once there are shots at two
//      or more settings, shrunk toward the prior so one noisy shot can't wreck it.
//   3. Solve for the setting that lands the normalised time in the middle of the
//      target window, nudged by taste, and round to a whole dial number.

export const DEFAULTS = {
  dose: 18, // g in
  ratio: 2, // 1:2 -> 36 g out
  timeMin: 25, // s
  timeMax: 30, // s
  // Seconds from pressing the button to steady flow (pre-infusion + first drips).
  // Yield accumulates roughly linearly after this, so we only scale this part.
  flowDelay: 6,
  secondsPerStep: 3, // prior sensitivity of the outer grind dial
  priorWeight: 2, // how many "shots worth" of trust the prior gets
  minSetting: 1,
  maxSetting: 16,
  defaultStart: 5, // Breville's recommended starting point
  tasteShift: 2, // s added/removed from the target time for sour/bitter
  recencyHalfLife: 2, // shots; newer shots anchor the prediction more (beans age)
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => Math.round(x * 10) / 10;

/** Time the shot would have taken to reach dose * ratio grams. */
export function normalisedTime(shot, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const { time, yield: out } = shot;
  const dose = shot.dose ?? o.dose;
  if (!(time > 0) || !(out > 0)) return null;
  const targetYield = dose * o.ratio;
  const delay = Math.min(o.flowDelay, time * 0.5);
  return delay + (time - delay) * (targetYield / out);
}

/** Target time for the next shot, shifted by how the last shot tasted. */
export function targetTime(taste, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const mid = (o.timeMin + o.timeMax) / 2;
  const shift = taste === 'sour' ? o.tasteShift : taste === 'bitter' ? -o.tasteShift : 0;
  return clamp(mid + shift, o.timeMin, o.timeMax);
}

/**
 * Seconds-per-step sensitivity for a set of points [{setting, t}].
 * Returns the prior blended with a least-squares fit when the fit is sane.
 */
export function estimateSensitivity(points, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const prior = o.secondsPerStep;
  const settings = new Set(points.map((p) => p.setting));
  if (points.length < 2 || settings.size < 2) {
    return { k: prior, fitted: null, source: 'prior' };
  }
  const n = points.length;
  const ms = points.reduce((s, p) => s + p.setting, 0) / n;
  const mt = points.reduce((s, p) => s + p.t, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.setting - ms) * (p.t - mt);
    sxx += (p.setting - ms) ** 2;
  }
  const fitted = -sxy / sxx; // time falls as the setting rises
  // Outside this band the data is dominated by noise (channeling, bad puck prep).
  if (!(fitted >= 0.5 && fitted <= 12)) {
    return { k: prior, fitted, source: 'prior (fit rejected)' };
  }
  const w = n - 1;
  const k = (o.priorWeight * prior + w * fitted) / (o.priorWeight + w);
  return { k, fitted, source: 'bag' };
}

/** Learn a personal prior sensitivity and start setting from previous bags. */
export function learnFromHistory(bags, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const ks = [];
  const finals = [];
  for (const bag of bags) {
    const pts = toPoints(bag.shots ?? [], o);
    const est = estimateSensitivity(pts, o);
    if (est.source === 'bag') ks.push(est.fitted);
    const good = pts.filter((p) => p.t >= o.timeMin && p.t <= o.timeMax);
    if (good.length) finals.push(good[good.length - 1].setting);
  }
  return {
    secondsPerStep: ks.length >= 2 ? median(ks) : o.secondsPerStep,
    startSetting: finals.length ? Math.round(median(finals)) : o.defaultStart,
  };
}

const ROAST_OFFSET = { light: -1, medium: 0, dark: 1 };

/** Suggested first setting for a new bag. */
export function startingSetting(roast, history, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const base = history?.startSetting ?? o.defaultStart;
  return clamp(base + (ROAST_OFFSET[roast] ?? 0), o.minSetting, o.maxSetting);
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
 * Recommend the next grind setting for a bag.
 * @param shots chronological [{setting, dose, time, yield, taste}]
 * @returns recommendation object, or null with no usable shots
 */
export function recommend(shots, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const points = toPoints(shots, o);
  if (!points.length) return null;

  const last = points[points.length - 1];
  const target = targetTime(last.shot.taste, o);
  const sens = estimateSensitivity(points, o);
  const k = sens.k;

  // Anchor on a recency-weighted average of the bag's shots, projected onto the
  // fitted line, so the newest shots matter most as the beans age.
  let wsum = 0;
  let anchorT = 0;
  points.forEach((p, i) => {
    const age = points.length - 1 - i;
    const w = 0.5 ** (age / o.recencyHalfLife);
    // Move each shot along the line to the last shot's setting before averaging.
    anchorT += w * (p.t - k * (last.setting - p.setting));
    wsum += w;
  });
  anchorT /= wsum;

  const exact = last.setting + (anchorT - target) / k;
  const rounded = Math.round(exact);
  const setting = clamp(rounded, o.minSetting, o.maxSetting);
  const predictedTime = anchorT - k * (setting - last.setting);

  const notes = [];
  const lastTime = last.shot.time;
  const lastYield = last.shot.yield;
  const dose = last.shot.dose ?? o.dose;
  const inWindow = last.t >= o.timeMin && last.t <= o.timeMax;
  const tasteOk = !last.shot.taste || last.shot.taste === 'balanced';

  let status;
  if (inWindow && tasteOk) {
    status = 'dialed';
  } else if (last.t < o.timeMin) {
    status = 'fast';
  } else if (last.t > o.timeMax) {
    status = 'slow';
  } else {
    status = 'taste';
  }

  if (Math.abs(dose - o.dose) >= 0.5) {
    notes.push(`Dose was ${dose} g. Keep it at ${o.dose} g so grind is the only thing changing.`);
  }
  if (rounded < o.minSetting) {
    notes.push(
      'Even the finest outer setting is predicted to run fast. Move the inner burr one step finer, then restart at 5.',
    );
  } else if (rounded > o.maxSetting) {
    notes.push(
      'Even the coarsest outer setting is predicted to run slow. Move the inner burr one step coarser, then restart at 5.',
    );
  }
  if (lastTime < 15 && last.setting <= 3) {
    notes.push('Very fast at a fine setting usually means channeling. Check dose, distribution and tamp.');
  }
  if (Math.abs(lastYield - dose * o.ratio) > 8) {
    notes.push(`Stop the shot nearer ${dose * o.ratio} g. Estimates get less accurate the further you are from target.`);
  }
  if (status === 'dialed' && setting !== last.setting) {
    // In the window and tasting good: don't chase noise.
    notes.push('Within target, so the setting stays put. Change it only if the taste is off.');
  }

  const finalSetting = status === 'dialed' ? last.setting : setting;
  return {
    status,
    setting: finalSetting,
    change: finalSetting - last.setting,
    exactSetting: round1(exact),
    predictedTime: round1(status === 'dialed' ? last.t : predictedTime),
    lastNormalisedTime: round1(last.t),
    targetTime: target,
    secondsPerStep: round1(k),
    sensitivitySource: sens.source,
    notes,
  };
}
