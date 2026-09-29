import { editorState, modeHandlers, markDirty, selectElement } from '../editor.js';
import { colorVar } from '../lib/brand-tokens.js';

// Curated, spectrum-ordered palette. Not all 18 raw families — a sensible
// on-brand set arranged warm → cool, with neutrals last. Each hue is shown as a
// row of three steps (light → mid → dark) so the picker reads as colour groups.
const CURATED_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal',
  'cyan', 'blue', 'indigo', 'purple', 'violet', 'fuchsia', 'pink', 'gray',
];
const STEPS = [300, 500, 700]; // light, mid, dark
const SIZE_STEP = 4; // px per click

let pop = null;

// The --aws-* CSS variables are defined in the IFRAME's stylesheet, not in this
// parent page — so `background: var(--aws-orange-400)` renders transparent here.
// Resolve each token to its concrete color from inside the iframe so the swatch
// actually shows its colour. Cached per hue-step.
const _colorCache = new Map();
function resolveColor(token) {
  if (_colorCache.has(token)) return _colorCache.get(token);
  const doc = editorState.frameDoc;
  let value = token; // fallback: the raw var() (may render transparent)
  if (doc) {
    const probe = doc.createElement('span');
    probe.style.color = token;
    probe.style.display = 'none';
    doc.body.appendChild(probe);
    const resolved = doc.defaultView.getComputedStyle(probe).color;
    probe.remove();
    if (resolved && resolved !== 'rgba(0, 0, 0, 0)') value = resolved;
  }
  _colorCache.set(token, value);
  return value;
}

function makeSwatch(target, token, label, isTransparent) {
  const sw = document.createElement('button');
  sw.className = 'sp-swatch' + (isTransparent ? ' sp-swatch-none' : '');
  sw.dataset.target = target;
  sw.dataset.token = token; // '' for transparent
  if (!isTransparent) sw.style.background = resolveColor(token);
  sw.title = label;
  sw.addEventListener('click', () => {
    if (!editorState.selected) return;
    const prop = target === 'background' ? 'backgroundColor' : 'color';
    editorState.selected.style[prop] = isTransparent ? 'transparent' : token;
    markDirty();
    markCurrent(); // refresh the selected-ring
  });
  return sw;
}

function buildSwatchGrid(target) {
  const wrap = document.createDocumentFragment();
  // Background gets a leading "transparent / none" chip on its own short row so
  // it doesn't shift the colour matrix out of alignment.
  if (target === 'background') {
    const noneRow = document.createElement('div');
    noneRow.className = 'sp-none-row';
    noneRow.appendChild(makeSwatch('background', '', 'No fill (transparent)', true));
    wrap.appendChild(noneRow);
  }
  // Colour matrix: one COLUMN per hue (spectrum order), one ROW per lightness
  // step (light → mid → dark). Emit step-major so each row is a clean spectrum
  // at a single brightness — no light/mid/dark zigzag within a row.
  const grid = document.createElement('div');
  grid.className = 'sp-swatches';
  grid.dataset.target = target;
  grid.style.gridTemplateColumns = `repeat(${CURATED_HUES.length}, 1fr)`;
  for (const step of STEPS) {
    for (const hue of CURATED_HUES) {
      grid.appendChild(makeSwatch(target, colorVar(hue, step), `${hue} ${step}`));
    }
  }
  wrap.appendChild(grid);
  return wrap;
}

// Highlight the swatch matching the selected element's current color / bg.
function markCurrent() {
  if (!pop || !editorState.selected) return;
  const s = editorState.selected.style;
  const cur = { color: s.color || '', background: (s.backgroundColor || '') };
  for (const sw of pop.querySelectorAll('.sp-swatch')) {
    const target = sw.dataset.target;
    const token = sw.dataset.token;
    const val = target === 'background' ? cur.background : cur.color;
    const isMatch = token
      ? val === token
      : (target === 'background' && (val === '' || val === 'transparent'));
    sw.classList.toggle('sp-current', isMatch);
  }
}

function buildPopover() {
  const el = document.createElement('div');
  el.id = 'style-popover';
  const cText = document.createElement('div');
  cText.className = 'sp-section';
  cText.innerHTML = '<label>Text color</label>';
  cText.appendChild(buildSwatchGrid('color'));
  const cBg = document.createElement('div');
  cBg.className = 'sp-section';
  cBg.innerHTML = '<label>Background</label>';
  cBg.appendChild(buildSwatchGrid('background'));
  const cSize = document.createElement('div');
  cSize.className = 'sp-section';
  cSize.innerHTML = '<label>Text size</label>' +
    '<button class="sp-btn" data-size="-1">Bigger ↑</button>' +
    '<button class="sp-btn" data-size="1">Smaller ↓</button>';
  el.append(cText, cBg, cSize);
  el.querySelectorAll('[data-size]').forEach(btn => btn.addEventListener('click', () => {
    const sel = editorState.selected; if (!sel) return;
    const cs = sel.ownerDocument.defaultView.getComputedStyle(sel);
    const cur = parseFloat(cs.fontSize) || 16;
    const dir = Number(btn.dataset.size); // -1 = bigger, +1 = smaller
    const next = Math.max(8, cur + dir * -SIZE_STEP); // negative dir = up
    sel.style.fontSize = `${next}px`;
    markDirty();
  }));
  return el;
}

function showPopover(el) {
  if (!pop) { pop = buildPopover(); document.body.appendChild(pop); }
  markCurrent();
  const fr = document.getElementById('deck-frame').getBoundingClientRect();
  const r = el.getBoundingClientRect(); // iframe-relative viewport coords
  pop.style.display = 'block';
  // Measure now that it's displayed, then clamp fully inside the viewport.
  const pr = pop.getBoundingClientRect();
  const margin = 8;
  const anchorLeft = fr.left + r.left;
  const anchorBelow = fr.top + r.top + r.height + margin;
  const anchorAbove = fr.top + r.top - pr.height - margin;
  // Prefer below; flip above if it would overflow the bottom and there's room up top.
  let top = anchorBelow;
  if (anchorBelow + pr.height > window.innerHeight - margin && anchorAbove >= margin) {
    top = anchorAbove;
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - pr.height - margin));
  const left = Math.max(margin, Math.min(anchorLeft, window.innerWidth - pr.width - margin));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function onClick(e) {
  const el = e.target;
  if (!el || el.nodeType !== 1 || el.closest('svg') || el.tagName === 'DECK-STAGE') return;
  e.preventDefault();
  selectElement(el);
  showPopover(el);
}

modeHandlers.style = {
  arm() { editorState.frameDoc?.addEventListener('click', onClick, true); },
  disarm() {
    editorState.frameDoc?.removeEventListener('click', onClick, true);
    if (pop) pop.style.display = 'none';
    selectElement(null);
  },
};
