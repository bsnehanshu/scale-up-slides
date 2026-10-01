import { editorState, modeHandlers, markDirty, selectElement, drawSelection } from '../editor.js';
import { snap } from '../lib/snap.js';

const STEP = 8;

function currentOffset(el, prop) {
  const v = parseFloat(el.style[prop]);
  return Number.isFinite(v) ? v : 0;
}

function nudge(el, dx, dy, resize) {
  if (resize) {
    // Read the element's CURRENT layout size in its own (unscaled) coordinate
    // space via computed style — NOT getBoundingClientRect(), which returns the
    // deck's scaled screen pixels and would corrupt the written width/height.
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    const curW = parseFloat(cs.width) || 0;
    const curH = parseFloat(cs.height) || 0;
    // Slide components often ship an inline `max-width` (e.g. 1300px on the
    // cover headline). That caps the element and makes resizing look stuck, so
    // override the min/max bounds to let width/height actually take effect.
    el.style.maxWidth = 'none';
    el.style.minWidth = '0';
    el.style.maxHeight = 'none';
    el.style.width = `${snap(Math.max(STEP, curW + dx), STEP)}px`;
    el.style.height = `${snap(Math.max(STEP, curH + dy), STEP)}px`;
  } else {
    const ml = snap(currentOffset(el, 'marginLeft') + dx, STEP);
    const mt = snap(currentOffset(el, 'marginTop') + dy, STEP);
    el.style.marginLeft = `${Math.max(0, ml)}px`;
    el.style.marginTop = `${Math.max(0, mt)}px`;
  }
  markDirty();
  drawSelection(el);
}

function onClick(e) {
  const el = e.target;
  if (!el || el.nodeType !== 1 || el.tagName === 'SECTION' || el.tagName === 'DECK-STAGE' || el.closest('svg')) return;
  e.preventDefault();
  selectElement(el);
}

function onKey(e) {
  if (!editorState.selected) return;
  const map = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
  const d = map[e.key];
  if (!d) return;
  e.preventDefault();
  // Clicking a slide element gives the IFRAME focus, so arrow keys land in the
  // iframe — and the deck-stage shell would otherwise navigate slides on them.
  // Stop the event here so we nudge instead of paging the deck.
  e.stopImmediatePropagation();
  nudge(editorState.selected, d[0], d[1], e.shiftKey);
}

modeHandlers.layout = {
  arm() {
    editorState.frameDoc?.addEventListener('click', onClick, true);
    // Listen on BOTH the parent window and the iframe document (capture phase).
    // After a click into the slide, keydown fires inside the iframe, not the
    // parent — so a parent-only listener would never see the arrow keys.
    window.addEventListener('keydown', onKey, true);
    editorState.frameDoc?.addEventListener('keydown', onKey, true);
  },
  disarm() {
    editorState.frameDoc?.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
    editorState.frameDoc?.removeEventListener('keydown', onKey, true);
    selectElement(null);
  },
};
