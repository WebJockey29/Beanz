import { recommend, learnFromHistory, startingSetting, normalisedTime } from './dialin.js';

const STORAGE_KEY = 'beanz.v1';
const $ = (id) => document.getElementById(id);

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

// Options personalised from every other bag the user has dialed in.
function optsFor(bag) {
  const history = learnFromHistory(state.bags.filter((b) => b !== bag));
  return { history, opts: { secondsPerStep: history.secondsPerStep } };
}

function render() {
  const sel = $('bag-select');
  sel.innerHTML = state.bags.length
    ? state.bags.map((b) => `<option value="${b.id}">${escape(b.name)} (${b.roast})</option>`).join('')
    : '<option value="">Add a bag to start</option>';
  sel.value = state.currentId ?? '';

  const bag = currentBag();
  const tbody = $('shots');
  tbody.innerHTML = '';
  $('rec').hidden = true;
  $('start-hint').textContent = '';
  $('empty').hidden = !!bag?.shots.length;
  if (!bag) return;

  const { history, opts } = optsFor(bag);

  bag.shots.forEach((s, i) => {
    const t = normalisedTime(s);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${s.setting}</td><td>${s.dose}</td><td>${s.time}s</td>
      <td>${s.yield}g</td><td>${t ? t.toFixed(1) + 's' : '–'}</td><td>${s.taste || ''}</td>
      <td><button type="button" data-i="${i}" aria-label="Delete shot">✕</button></td>`;
    tbody.appendChild(tr);
  });

  if (!bag.shots.length) {
    const start = startingSetting(bag.roast, history);
    $('start-hint').textContent = `Suggested first setting for this bag: ${start}`;
    $('setting').value = start;
    return;
  }

  const r = recommend(bag.shots, opts);
  $('setting').value = r.setting;
  renderRec(r);
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
    <p class="hint">Sensitivity ${r.secondsPerStep}s per step (${r.sensitivitySource})</p>
    ${r.notes.length ? `<ul>${r.notes.map((n) => `<li>${escape(n)}</li>`).join('')}</ul>` : ''}`;
  el.hidden = false;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

$('bag-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const bag = {
    id: crypto.randomUUID(),
    name: $('bag-name').value.trim(),
    roast: $('bag-roast').value,
    shots: [],
  };
  state.bags.push(bag);
  state.currentId = bag.id;
  $('bag-name').value = '';
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
  if (!bag || !confirm(`Delete "${bag.name}" and its shots?`)) return;
  state.bags = state.bags.filter((b) => b !== bag);
  state.currentId = state.bags.at(-1)?.id ?? null;
  save();
  render();
});

$('shot-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const bag = currentBag();
  if (!bag) {
    alert('Add a bag first.');
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
  render();
});

$('shots').addEventListener('click', (e) => {
  const i = e.target.dataset?.i;
  if (i === undefined) return;
  currentBag().shots.splice(Number(i), 1);
  save();
  render();
});

render();
