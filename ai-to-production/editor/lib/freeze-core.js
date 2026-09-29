// Pure HTML transform for freezing an edited deck into a static, runtime-free deck.
// No DOM APIs — operates on strings so it is unit-testable in Node.

/** Escape a value for safe interpolation into HTML text or a double-quoted attribute. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remove editor-only attributes that may linger on the deck-stage markup. */
export function stripEditorArtifacts(deckStageHtml) {
  return deckStageHtml
    // contenteditable="true" / contenteditable
    .replace(/\s+contenteditable(="[^"]*")?/g, '')
    // any data-editor-* marker attribute
    .replace(/\s+data-editor-[\w-]+(="[^"]*")?/g, '');
}

/**
 * Build a complete static deck HTML document.
 * @param {object} o
 * @param {string} o.title             document title
 * @param {string} o.deckStageHtml     outerHTML of the live <deck-stage> (post-edit)
 * @param {string} o.speakerNotesJson  JSON array string for #speaker-notes
 * @param {string} o.stylesHref        href to styles.css in the output
 * @param {string} o.deckStageSrc      src to deck-stage.js in the output
 * @returns {string} full HTML document
 */
export function buildFrozenHtml(o) {
  const slides = stripEditorArtifacts(o.deckStageHtml);
  const notesJson = o.speakerNotesJson.replace(/<\/(script)/gi, '<\\/$1');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(o.title)}</title>
<link rel="stylesheet" href="${escapeHtml(o.stylesHref)}">
<style>
  html, body { margin: 0; background: #000; }
  deck-stage:not(:defined) { visibility: hidden; }
  deck-stage { --slide-width: 1920px; --slide-height: 1080px; }
  .slide h1, .slide h2, .slide h3, .slide p { margin: 0; }
</style>
<script type="application/json" id="speaker-notes">
${notesJson}
</script>
</head>
<body>
${slides}
<script src="${escapeHtml(o.deckStageSrc)}"><\/script>
</body>
</html>
`;
}
