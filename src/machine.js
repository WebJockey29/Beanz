// Decorative SVG of a Barista Express-style machine. The grind dial shows the
// suggested setting, and logging a shot plays a short pour animation.

const BEANS = [
  [62, 62], [74, 58], [88, 63], [102, 59], [116, 63], [68, 50], [82, 47], [96, 51],
  [110, 48], [60, 38], [76, 36], [90, 39], [104, 35], [118, 39],
];

export const machineSVG = `
<svg class="machine" viewBox="0 0 360 300" role="img" aria-labelledby="machine-title">
  <title id="machine-title">Espresso machine</title>
  <defs>
    <linearGradient id="steel" x1="0" x2="1">
      <stop offset="0" stop-color="#9aa1a8"/>
      <stop offset=".18" stop-color="#e3e6e9"/>
      <stop offset=".5" stop-color="#c3c8cd"/>
      <stop offset=".82" stop-color="#e6e9ec"/>
      <stop offset="1" stop-color="#8e959c"/>
    </linearGradient>
    <linearGradient id="steel-v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eef0f2"/>
      <stop offset="1" stop-color="#a9afb5"/>
    </linearGradient>
    <radialGradient id="knob" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".6" stop-color="#bfc5ca"/>
      <stop offset="1" stop-color="#7d848b"/>
    </radialGradient>
    <linearGradient id="hopper" x1="0" x2="1">
      <stop offset="0" stop-color="#2b211c" stop-opacity=".75"/>
      <stop offset=".4" stop-color="#5a463a" stop-opacity=".45"/>
      <stop offset="1" stop-color="#2b211c" stop-opacity=".75"/>
    </linearGradient>
    <clipPath id="hopper-clip"><polygon points="54,70 126,70 136,22 44,22"/></clipPath>
    <clipPath id="cup-clip"><path d="M160 226 h40 l-4 30 h-32 z"/></clipPath>
  </defs>

  <!-- shadow -->
  <ellipse cx="180" cy="290" rx="150" ry="7" fill="#000" opacity=".15"/>

  <!-- bean hopper -->
  <rect x="40" y="12" width="100" height="12" rx="5" fill="#2a2a2a"/>
  <polygon points="54,70 126,70 136,22 44,22" fill="url(#hopper)" stroke="#1d1d1d" stroke-width="1.5"/>
  <g clip-path="url(#hopper-clip)">
    ${BEANS.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="6.5" ry="4.5" fill="${i % 3 ? '#5b3720' : '#4a2c18'}" transform="rotate(${(i * 37) % 80 - 40} ${x} ${y})"/>`).join('')}
  </g>
  <path d="M60 26 L56 66" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>

  <!-- cup warming tray -->
  <rect x="150" y="60" width="168" height="12" rx="3" fill="url(#steel-v)" stroke="#8b9198"/>
  <g stroke="#8b9198" stroke-width="1">
    ${[168, 186, 204, 222, 240, 258, 276, 294].map((x) => `<line x1="${x}" y1="63" x2="${x}" y2="69"/>`).join('')}
  </g>

  <!-- body -->
  <rect x="34" y="70" width="292" height="200" rx="16" fill="url(#steel)" stroke="#7e858c"/>
  <rect x="44" y="80" width="272" height="72" rx="10" fill="#d4d8dc" stroke="#9ba1a7"/>

  <!-- grind size dial (shows the suggested setting) -->
  <circle cx="74" cy="114" r="24" fill="#2b2b2b"/>
  <circle cx="74" cy="114" r="20" fill="url(#knob)" stroke="#6f767d"/>
  <text id="grind-dial" x="74" y="120" text-anchor="middle" font-size="17" font-weight="700" fill="#2b2018">5</text>
  <text x="74" y="147" text-anchor="middle" font-size="7" letter-spacing="1" fill="#5d646b">GRIND SIZE</text>

  <!-- grind amount knob -->
  <circle cx="122" cy="114" r="14" fill="url(#knob)" stroke="#6f767d"/>
  <line x1="122" y1="114" x2="130" y2="106" stroke="#2b2b2b" stroke-width="2" stroke-linecap="round"/>
  <text x="122" y="147" text-anchor="middle" font-size="7" letter-spacing="1" fill="#5d646b">AMOUNT</text>

  <!-- pressure gauge -->
  <circle cx="180" cy="116" r="30" fill="#2b2b2b"/>
  <circle cx="180" cy="116" r="26" fill="#f7f7f5"/>
  <path d="M199.5 106.1 A22 22 0 0 1 200.6 123.6" fill="none" stroke="#9c9c9c" stroke-width="6"/>
  ${Array.from({ length: 9 }, (_, i) => {
    const a = ((-135 + i * 33.75) * Math.PI) / 180;
    return `<line x1="${180 + 21 * Math.sin(a)}" y1="${116 - 21 * Math.cos(a)}" x2="${180 + 24 * Math.sin(a)}" y2="${116 - 24 * Math.cos(a)}" stroke="#444" stroke-width="1"/>`;
  }).join('')}
  <g class="needle"><line x1="180" y1="116" x2="180" y2="96" stroke="#c0392b" stroke-width="2" stroke-linecap="round"/></g>
  <circle cx="180" cy="116" r="3" fill="#2b2b2b"/>

  <!-- buttons -->
  ${[232, 254, 276, 298].map((x, i) => `<circle cx="${x}" cy="106" r="8" fill="url(#knob)" stroke="#6f767d"/><circle cx="${x}" cy="106" r="2.2" class="${i === 0 ? 'power-led' : ''}" fill="${i === 0 ? '#f0a33a' : '#7c838a'}"/>`).join('')}
  <rect x="226" y="124" width="78" height="14" rx="7" fill="#c3c8cd" stroke="#8b9198"/>
  <text x="265" y="134" text-anchor="middle" font-size="7" letter-spacing="1" fill="#5d646b">FILTER SIZE</text>

  <!-- grinder cradle -->
  <rect x="50" y="160" width="62" height="84" rx="8" fill="#2c2c2c"/>
  <rect x="70" y="162" width="22" height="8" rx="2" fill="#555"/>
  <rect x="62" y="234" width="38" height="6" rx="3" fill="#444"/>

  <!-- group head + portafilter -->
  <rect x="150" y="154" width="60" height="16" rx="5" fill="#b9bfc5" stroke="#7e858c"/>
  <rect x="146" y="170" width="68" height="15" rx="7" fill="#2c2c2c"/>
  <path d="M212 177 L282 196" stroke="#1f1f1f" stroke-width="11" stroke-linecap="round"/>
  <rect x="168" y="185" width="5" height="9" rx="1" fill="#2c2c2c"/>
  <rect x="187" y="185" width="5" height="9" rx="1" fill="#2c2c2c"/>

  <!-- espresso streams -->
  <g class="stream">
    <line x1="170.5" y1="194" x2="174" y2="246"/>
    <line x1="189.5" y1="194" x2="186" y2="246"/>
  </g>

  <!-- cup -->
  <path d="M200 232 q14 0 12 10 q-2 8 -14 8" fill="none" stroke="#f4f1ec" stroke-width="4"/>
  <path d="M158 224 h44 l-5 34 h-34 z" fill="#f4f1ec" stroke="#cfc8be"/>
  <g clip-path="url(#cup-clip)">
    <rect class="coffee" x="150" y="226" width="60" height="32" fill="#4a2a15"/>
    <rect class="crema" x="150" y="226" width="60" height="4" fill="#c58b4f"/>
  </g>

  <!-- steam wand + dial -->
  <circle cx="296" cy="176" r="14" fill="url(#knob)" stroke="#6f767d"/>
  <line x1="296" y1="176" x2="296" y2="165" stroke="#2b2b2b" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M308 196 L308 246 Q308 256 300 258" fill="none" stroke="#aab0b6" stroke-width="5" stroke-linecap="round"/>

  <!-- drip tray -->
  <rect x="40" y="258" width="280" height="22" rx="5" fill="url(#steel-v)" stroke="#7e858c"/>
  <g stroke="#7e858c" stroke-width="1.2">
    ${Array.from({ length: 22 }, (_, i) => `<line x1="${136 + i * 4.5}" y1="262" x2="${136 + i * 4.5}" y2="268"/>`).join('')}
  </g>
  <rect x="40" y="270" width="280" height="10" rx="4" fill="#9aa1a8"/>
</svg>`;

export function mountMachine(el) {
  el.innerHTML = machineSVG;
  const svg = el.querySelector('svg');
  const dial = svg.querySelector('#grind-dial');
  let timer;
  return {
    setGrind(setting) {
      dial.textContent = setting ?? '–';
    },
    pour() {
      clearTimeout(timer);
      svg.classList.remove('pouring');
      // Force a reflow so the animation restarts if triggered again.
      void svg.getBoundingClientRect();
      svg.classList.add('pouring');
      timer = setTimeout(() => svg.classList.remove('pouring'), 3200);
    },
  };
}
