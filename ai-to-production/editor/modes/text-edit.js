import { editorState, modeHandlers, markDirty, selectElement, frame } from '../editor.js';

// The SlideKit renders text as plain semantic tags with inline styles (via the
// Heading/Eyebrow/Caption primitives) — NOT `.aws-*` utility classes. So we
// target by tag name and pick leaf text nodes.
const TEXT_TAGS = new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','LI','BLOCKQUOTE','FIGCAPTION','TD','TH','A','EM','STRONG','DT','DD']);

function isEditableTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (!TEXT_TAGS.has(el.tagName)) return false;
  // Ignore SVG text (svg <title>, <text>) — not slide copy.
  if (el.closest('svg')) return false;
  // Must actually contain visible text.
  if (!el.textContent || !el.textContent.trim()) return false;
  // Leaf-ish: no descendant element that is itself a text tag (so we edit the
  // innermost run, e.g. a <span> inside a heading, not the whole container).
  for (const child of el.querySelectorAll('*')) {
    if (TEXT_TAGS.has(child.tagName) && !child.closest('svg')) return false;
  }
  return true;
}

function onClick(e) {
  const el = e.target;
  if (!isEditableTarget(el)) return;
  e.preventDefault();
  selectElement(el);
  el.setAttribute('contenteditable', 'true');
  el.focus();
  const before = el.textContent;
  const commit = () => {
    el.removeAttribute('contenteditable');
    el.removeEventListener('blur', commit);
    el.removeEventListener('keydown', onKey);
    if (el.textContent !== before) markDirty();
  };
  const onKey = (ke) => { if (ke.key === 'Escape') { el.blur(); } };
  el.addEventListener('blur', commit);
  el.addEventListener('keydown', onKey);
}

modeHandlers.text = {
  arm() {
    const doc = editorState.frameDoc;
    if (!doc) return;
    doc.addEventListener('click', onClick, true);
  },
  disarm() {
    const doc = editorState.frameDoc;
    if (!doc) return;
    doc.removeEventListener('click', onClick, true);
  },
};
