import {
  recommend,
  learnFromHistory,
  startingSetting,
  normalisedTime,
  predictionLog,
  DEFAULTS,
} from './dialin.js';
import { mountMachine } from './machine.js';

const STORAGE_KEY = 'beanz.v1';
const $ = (id) => document.getElementById(id);
const machine = mountMachine($('machine'));

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? { bags: [], currentId: null };
  } catch {
    return { bags: [], currentId: null };
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode); the session still works in memory.
  }
}

const currentBag = () => state.bags.find((b) => b.id === state.currentId);

// What the app knows before these beans: learned from every other bag.
const historyFor = (bag) => learnFromHistory(state.bags.filter((b) => b !== bag));

function render() {
  const sel = $('bag-select');
  sel.innerHTML = state.bags.length
    ? [...state.bags].reverse().map((b) => `<option value="${b.id}">${escape(b.name)} · ${b.roast}</option>`).join('')
    : '<option value="">No beans yet</option>';
  sel.value = state.currentId ?? '';
  $('bag-form').hidden = state.bags.length > 0 && !showBagForm;

  const bag = currentBag();
  $('rec').hidden = true;
  renderLearned(bag);

  if (!bag) {
    $('shots').innerHTML = '';
    $('empty').hidden = false;
    machine.setGrind(null);
    $('machine-caption').textContent = 'Add your beans to get a starting grind.';
    return;
  }

  const history = historyFor(bag);
  renderShots(bag, history);

  if (!bag.shots.length) {
    const start = startingSetting(bag.roast, history);
    $('setting').value = start;
    machine.setGrind(start);
    $('machine-caption').textContent = `Fresh beans: start at grind ${start}`;
    return;
  }

  const r = recommend(bag.shots, history);
  $('setting').value = r.setting;
  machine.setGrind(r.setting);
  $('machine-caption').textContent = `Next shot: grind ${r.setting}`;
  renderRec(r);
}

function renderShots(bag, history) {
  const predicted = new Map(predictionLog(bag.shots, history).map((p) => [p.index, p]));
  $('shots').innerHTML = bag.shots
    .map((s, i) => {
      const t = normalisedTime(s);
      const p = predicted.get(i);
      const pred = p ? `${p.predicted}s <span class="err">(${p.error > 0 ? '+' : ''}${p.error})</span>` : '–';
      return `<tr><td>${i + 1}</td><td>${s.setting}</td><td>${s.time}s</td><td>${s.yield}g</td>
        <td>${t ? t.toFixed(1) + 's' : '–'}</td><td>${pred}</td><td>${s.taste || ''}</td>
        <td><button type="button" data-i="${i}" aria-label="Delete shot">✕</button></td></tr>`;
    })
    .join('');
  $('empty').hidden = bag.shots.length > 0;
}

function renderLearned(bag) {
  const all = learnFromHistory(state.bags);
  const stats = [
    ['Readings learned from', `${all.shotCount} shot${all.shotCount === 1 ? '' : 's'} · ${all.bagCount} bag${all.bagCount === 1 ? '' : 's'}`],
    ['Grinder sensitivity', `${all.secondsPerStep.toFixed(1)} s per step${all.kEvidence > DEFAULTS.machinePriorStrength ? '' : ' (starting guess)'}`],
    ['Your sweet spot', `${all.preferredTime.toFixed(1)} s${all.balancedCount ? ` (from ${all.balancedCount} balanced)` : ' (rate shots to learn it)'}`],
  ];
  if (bag) {
    const log = predictionLog(bag.shots, historyFor(bag));
    if (log.length) {
      const last = Math.abs(log.at(-1).error);
      const recent = log.slice(-3);
      const avg = recent.reduce((a, p) => a + Math.abs(p.error), 0) / recent.length;
      stats.push(['Prediction accuracy', `last ±${last.toFixed(1)} s · recent avg ±${avg.toFixed(1)} s`]);
    }
  }
  $('learned').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderRec(r) {
  const el = $('rec');
  const headline = {
    dialed: 'Dialed in, keep this setting',
    fast: 'Too fast, go finer',
    slow: 'Too slow, go coarser',
    taste: 'In time but off in taste, small tweak',
  }[r.status];
  const change = r.change === 0 ? 'no change' : `${r.change > 0 ? '+' : ''}${r.change} (${r.change > 0 ? 'coarser' : 'finer'})`;
  el.className = `card rec ${r.status}`;
  el.innerHTML = `
    <h2>${headline}</h2>
    <div class="big">Grind ${r.setting}</div>
    <p class="hint">${change} · last shot ≈ ${r.lastNormalisedTime}s to 36 g · expected ≈ ${r.predictedTime}s (target ${r.targetTime}s)</p>
    <p class="hint">Using ${r.secondsPerStep}s per step (${r.sensitivitySource})</p>
    ${r.notes.length ? `<ul>${r.notes.map((n) => `<li>${escape(n)}</li>`).join('')}</ul>` : ''}`;
  el.hidden = false;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

let showBagForm = false;

$('new-beans').addEventListener('click', () => {
  showBagForm = !showBagForm;
  render();
  if (showBagForm) $('bag-name').focus();
});

$('bag-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const bag = {
    id: crypto.randomUUID(),
    name: $('bag-name').value.trim(),
    roast: $('bag-roast').value,
    created: new Date().toISOString(),
    shots: [],
  };
  state.bags.push(bag);
  state.currentId = bag.id;
  showBagForm = false;
  $('bag-name').value = '';
  $('shot-form').reset();
  save();
  render();
});

$('bag-select').addEventListener('change', (e) => {
  state.currentId = e.target.value;
  save();
  render();
});

$('delete-bag').addEventListener('click', () => {
  const bag = currentBag();
  if (!bag || !confirm(`Delete "${bag.name}" and its shots? The app will also forget what it learned from them.`)) return;
  state.bags = state.bags.filter((b) => b !== bag);
  state.currentId = state.bags.at(-1)?.id ?? null;
  save();
  render();
});

$('shot-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const bag = currentBag();
  if (!bag) {
    showBagForm = true;
    render();
    $('bag-name').focus();
    return;
  }
  bag.shots.push({
    setting: Number($('setting').value),
    dose: Number($('dose').value),
    time: Number($('time').value),
    yield: Number($('yield').value),
    taste: $('taste').value || undefined,
    at: new Date().toISOString(),
  });
  $('time').value = '';
  $('yield').value = '';
  $('taste').value = '';
  save();
  machine.pour();
  render();
});

$('shots').addEventListener('click', (e) => {
  const i = e.target.closest('button')?.dataset.i;
  if (i === undefined) return;
  currentBag().shots.splice(Number(i), 1);
  save();
  render();
});

render();
