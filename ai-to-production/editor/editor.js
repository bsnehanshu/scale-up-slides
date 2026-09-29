// Editor orchestrator: loads a deck into the iframe, manages mode + selection,
// tracks a dirty flag. Edit behaviour is added by mode modules in later tasks.

const frame = document.getElementById('deck-frame');
const emptyHint = document.getElementById('empty-hint');

export const editorState = {
  mode: 'text',
  selected: null,     // element inside the iframe doc
  dirty: false,
  frameDoc: null,     // iframe's document once loaded
  deckStage: null,    // the <deck-stage> element inside the iframe
};

export function markDirty() {
  editorState.dirty = true;
  document.body.setAttribute('data-dirty', 'true');
}

/** Load a deck URL into the iframe and resolve when its <deck-stage> is ready. */
export function loadDeck(url) {
  return new Promise((resolve) => {
    frame.addEventListener('load', function onLoad() {
      frame.removeEventListener('load', onLoad);
      const doc = frame.contentDocument;
      editorState.frameDoc = doc;
      emptyHint.style.display = 'none';
      // deck-stage upgrades after React mounts + its script appends; poll briefly.
      const start = Date.now();
      (function waitForStage() {
        const stage = doc.querySelector('deck-stage');
        if (stage && stage.length !== undefined) {
          editorState.deckStage = stage;
          resolve(stage);
        } else if (Date.now() - start < 5000) {
          setTimeout(waitForStage, 50);
        } else {
          resolve(null); // give up; deck may be malformed
        }
      })();
    });
    frame.src = url;
  });
}

// --- mode switching ---------------------------------------------------------
const modeButtons = [...document.querySelectorAll('.modes button')];
export const modeHandlers = {}; // filled by mode modules: { text:{arm,disarm}, ... }

export function setMode(mode) {
  if (editorState.mode && modeHandlers[editorState.mode]) modeHandlers[editorState.mode].disarm?.();
  editorState.mode = mode;
  modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  modeHandlers[mode]?.arm?.();
}
modeButtons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

// --- deck opening -----------------------------------------------------------
const params = new URLSearchParams(location.search);
if (params.get('deck')) loadDeck(params.get('deck'));

document.getElementById('open-deck').addEventListener('click', () =>
  document.getElementById('deck-file').click());
document.getElementById('deck-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadDeck(URL.createObjectURL(file));
});

// --- unsaved-work guard -----------------------------------------------------
window.addEventListener('beforeunload', (e) => {
  if (editorState.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// --- present/edit toggle (reuses deck-stage's postMessage contract) ---------
let presenting = false;
document.getElementById('present-toggle').addEventListener('click', () => {
  presenting = !presenting;
  document.getElementById('present-toggle').textContent = presenting ? 'Edit' : 'Present';
  frame.contentWindow?.postMessage({ __omelette_presenting: presenting }, '*');
  if (presenting && editorState.mode) modeHandlers[editorState.mode]?.disarm?.();
  else modeHandlers[editorState.mode]?.arm?.();
});

// --- shared selection overlay (drawn in parent, over the iframe) -----------
const stageEl = document.getElementById('stage');
let selOverlay = document.getElementById('sel-overlay');
if (!selOverlay) {
  selOverlay = document.createElement('div');
  selOverlay.id = 'sel-overlay';
  stageEl.appendChild(selOverlay);
}

/** Draw the selection outline over an element that lives inside the iframe. */
export function drawSelection(el) {
  if (!el) { selOverlay.style.display = 'none'; return; }
  const fr = frame.getBoundingClientRect();
  const r = el.getBoundingClientRect(); // relative to iframe viewport
  selOverlay.style.display = 'block';
  selOverlay.style.left = `${fr.left + r.left}px`;
  selOverlay.style.top = `${fr.top + r.top}px`;
  selOverlay.style.width = `${r.width}px`;
  selOverlay.style.height = `${r.height}px`;
}

export function selectElement(el) {
  if (editorState.selected) editorState.selected.removeAttribute('data-editor-selected');
  editorState.selected = el;
  if (el) el.setAttribute('data-editor-selected', '');
  drawSelection(el);
}

export { frame };
