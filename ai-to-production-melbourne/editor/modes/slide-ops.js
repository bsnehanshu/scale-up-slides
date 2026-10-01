// Slide operations. The deck-stage thumbnail rail (reorder / skip / delete) is
// always visible, so there is no separate "Slides" mode — the only op the rail
// lacks is Duplicate, which lives as an always-on toolbar button here.
import { editorState, markDirty } from '../editor.js';

function duplicateCurrent() {
  const stage = editorState.deckStage;
  if (!stage) return;
  const i = stage.index;
  const slides = [...stage.querySelectorAll(':scope > section')];
  const src = slides[i];
  if (!src) return;
  const clone = src.cloneNode(true);
  clone.removeAttribute('data-deck-active');
  clone.removeAttribute('data-deck-skip');
  clone.removeAttribute('data-screen-label');
  src.after(clone); // triggers slotchange -> _collectSlides() in deck-stage
  markDirty();
}

// Mark the deck dirty on any rail mutation (skip / move / delete).
function bindDeckChange() {
  if (editorState.deckStage) {
    editorState.deckStage.addEventListener('deckchange', () => markDirty());
  }
}

// Wire the always-on Duplicate button immediately.
document.getElementById('dup-slide')?.addEventListener('click', duplicateCurrent);

// Bind deckchange once a deck is loaded (frameDoc/deckStage become available
// on the iframe 'load' event, which editor.js also listens for).
document.getElementById('deck-frame')?.addEventListener('load', () => {
  setTimeout(bindDeckChange, 150);
});
