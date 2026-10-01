// Freeze glue: turns the live edited deck (in the iframe) into a static,
// runtime-free artifact. Two export paths share ONE recursive CSS inliner:
//   - Single file:  everything inlined into one self-contained deck.html
//   - Folder (.zip): self-contained styles.css + deck-stage.js + assets/ + index.html
//
// See lib/freeze-core.js (pure HTML transform) and lib/zip.js (store-only zip).
// The live deck references its stylesheet + deck-stage.js at VARIABLE relative
// paths, so we resolve their absolute URLs from the live DOM rather than guess.

import { editorState } from './editor.js';
import { buildFrozenHtml } from './lib/freeze-core.js';
import { buildZip } from './lib/zip.js';

function mimeFor(path) {
  const p = path.split('?')[0].split('#')[0].toLowerCase();
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.woff2')) return 'font/woff2';
  if (p.endsWith('.woff')) return 'font/woff';
  if (p.endsWith('.ttf')) return 'font/ttf';
  if (p.endsWith('.otf')) return 'font/otf';
  if (p.endsWith('.eot')) return 'application/vnd.ms-fontobject';
  return 'application/octet-stream';
}

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

function bytesToBase64(bytes) {
  let bin = '';
  const CH = 0x8000; // chunk apply() to avoid call-stack limits on large fonts
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

const isAbsoluteRef = (ref) => /^(data:|https?:\/\/|\/\/|#)/i.test(ref);

/**
 * Recursively resolve @import statements and convert every local url(...) target
 * (fonts, background images) to a data: URI. Each url() is resolved against the
 * URL of the CSS file it appeared in (tracked as we recurse). Returns one CSS
 * string with no @import and no remaining local url() references.
 */
async function inlineCss(entryUrl) {
  const cssCache = new Map(); // url -> already-inlined css (dedupe + cycle guard)

  async function process(url, stack) {
    if (cssCache.has(url)) return cssCache.get(url);
    if (stack.includes(url)) return ''; // @import cycle — bail on the back-edge
    let css;
    try {
      css = await fetchText(url);
    } catch (e) {
      console.warn('[freeze] could not fetch CSS', url, e.message);
      return '';
    }

    // 0) Strip CSS comments before scanning. Otherwise a comment mentioning
    //    "@import manifest" (as the AWS styles.css header does) is matched as a
    //    bogus import whose trailing `[^;]*;` then swallows the NEXT real
    //    @import statement, silently dropping a stylesheet (e.g. fonts.css).
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // 1) Inline @import "x"; / @import url(x); / @import url("x") screen;
    //    Rebuild the string segment-by-segment so replacement text (which may
    //    itself contain @import-looking substrings) is never re-scanned.
    const importRe = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?[^;]*;/gi;
    let out = '';
    let last = 0;
    let m;
    const parts = [];
    while ((m = importRe.exec(css)) !== null) {
      parts.push({ start: m.index, end: importRe.lastIndex, ref: m[1] });
    }
    for (const part of parts) {
      out += css.slice(last, part.start);
      if (!isAbsoluteRef(part.ref)) {
        const abs = new URL(part.ref, url).href;
        out += await process(abs, [...stack, url]);
      }
      // absolute (http/protocol-relative) imports are dropped rather than
      // left dead — a frozen deck must be self-contained/offline.
      last = part.end;
    }
    out += css.slice(last);
    css = out;

    // 2) Convert remaining local url(...) refs to data: URIs, resolved against
    //    THIS css file's URL. Collect first, then splice back-to-front so the
    //    already-computed indices stay valid.
    const urlRe = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
    const hits = [];
    while ((m = urlRe.exec(css)) !== null) {
      hits.push({ start: m.index, end: urlRe.lastIndex, ref: m[2] });
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      const ref = h.ref.trim();
      if (isAbsoluteRef(ref)) continue;
      try {
        const abs = new URL(ref, url).href;
        const bytes = await fetchBytes(abs);
        const dataUri = `url("data:${mimeFor(ref)};base64,${bytesToBase64(bytes)}")`;
        css = css.slice(0, h.start) + dataUri + css.slice(h.end);
      } catch (e) {
        console.warn('[freeze] could not inline url()', ref, e.message);
        // leave the original url() as-is
      }
    }

    cssCache.set(url, css);
    return css;
  }

  return process(entryUrl, []);
}

/** Resolve the deck's real stylesheet + deck-stage.js absolute URLs from the live DOM. */
function resolveDeckUrls() {
  const doc = editorState.frameDoc;
  const link = doc.querySelector('link[rel="stylesheet"]');
  const scripts = [...doc.querySelectorAll('script[src]')].map((s) => s.src);
  const deckStageUrl = scripts.find((s) => /deck-stage\.js(\?|#|$)/.test(s));
  return { stylesUrl: link ? link.href : null, deckStageUrl };
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function gather() {
  const doc = editorState.frameDoc;
  const stage = editorState.deckStage;
  if (!doc || !stage) {
    throw new Error('No deck loaded — open a deck before exporting.');
  }
  const notes = doc.getElementById('speaker-notes');
  return {
    doc,
    title: doc.title || 'AWS deck',
    deckStageHtml: stage.outerHTML,
    speakerNotesJson: notes ? notes.textContent.trim() || '[]' : '[]',
  };
}

// --- single self-contained .html --------------------------------------------
export async function exportSingleFile() {
  const g = gather();
  const { stylesUrl, deckStageUrl } = resolveDeckUrls();
  const inlinedCss = stylesUrl ? await inlineCss(stylesUrl) : '';
  const deckStageJs = deckStageUrl ? await fetchText(deckStageUrl) : '';

  // Inline <img> slide assets as data: URIs.
  const wrap = document.createElement('div');
  wrap.innerHTML = g.deckStageHtml;
  for (const img of wrap.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || isAbsoluteRef(src)) continue;
    try {
      const abs = new URL(src, g.doc.baseURI).href;
      const bytes = await fetchBytes(abs);
      img.setAttribute('src', `data:${mimeFor(src)};base64,${bytesToBase64(bytes)}`);
    } catch (e) {
      console.warn('[freeze] could not inline img', src, e.message);
    }
  }

  // Build with sentinel placeholders, then swap link/script tags for inline
  // <style>/<script> blocks (buildFrozenHtml escapes the sentinels, so match escaped).
  const STYLES = '__FREEZE_STYLES__';
  const DECKSTAGE = '__FREEZE_DECKSTAGE__';
  let html = buildFrozenHtml({
    title: g.title,
    deckStageHtml: wrap.innerHTML,
    speakerNotesJson: g.speakerNotesJson,
    stylesHref: STYLES,
    deckStageSrc: DECKSTAGE,
  });
  // Guard the CSS/JS payloads against closing-tag breakout.
  const safeCss = inlinedCss.replace(/<\/(style)/gi, '<\\/$1');
  const safeJs = deckStageJs.replace(/<\/(script)/gi, '<\\/$1');
  html = html
    .replace(`<link rel="stylesheet" href="${STYLES}">`, `<style>\n${safeCss}\n</style>`)
    .replace(`<script src="${DECKSTAGE}"><\/script>`, `<script>\n${safeJs}\n<\/script>`);

  download('deck.html', new Blob([html], { type: 'text/html' }));
}

// --- folder as .zip (self-contained styles.css + deck-stage.js + assets/) ----
export async function exportFolderZip() {
  const g = gather();
  const { stylesUrl, deckStageUrl } = resolveDeckUrls();
  const enc = new TextEncoder();
  const files = [];

  // Rewrite slide <img> srcs to ./assets/<name> and collect the bytes.
  const wrap = document.createElement('div');
  wrap.innerHTML = g.deckStageHtml;
  const seen = new Map(); // original src -> out path (dedupe identical assets)
  const usedNames = new Set();
  for (const img of wrap.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || isAbsoluteRef(src)) continue;
    if (seen.has(src)) {
      img.setAttribute('src', './' + seen.get(src));
      continue;
    }
    let base = src.split('/').pop().split('?')[0].split('#')[0] || 'asset';
    // Avoid clobbering distinct sources that share a basename.
    if (usedNames.has(base)) {
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      let i = 1;
      while (usedNames.has(`${stem}-${i}${ext}`)) i++;
      base = `${stem}-${i}${ext}`;
    }
    const outPath = `assets/${base}`;
    try {
      const bytes = await fetchBytes(new URL(src, g.doc.baseURI).href);
      files.push({ path: outPath, bytes });
      usedNames.add(base);
      seen.set(src, outPath);
      img.setAttribute('src', './' + outPath);
    } catch (e) {
      console.warn('[freeze] could not fetch asset', src, e.message);
      // leave original src if we could not fetch it
    }
  }

  const inlinedCss = stylesUrl ? await inlineCss(stylesUrl) : '';
  const deckStageJs = deckStageUrl ? await fetchText(deckStageUrl) : '';

  const html = buildFrozenHtml({
    title: g.title,
    deckStageHtml: wrap.innerHTML,
    speakerNotesJson: g.speakerNotesJson,
    stylesHref: './styles.css',
    deckStageSrc: './deck-stage.js',
  });

  files.push({ path: 'index.html', bytes: enc.encode(html) });
  files.push({ path: 'styles.css', bytes: enc.encode(inlinedCss) });
  files.push({ path: 'deck-stage.js', bytes: enc.encode(deckStageJs) });

  download('deck.zip', new Blob([buildZip(files)], { type: 'application/zip' }));
}

// --- wire toolbar buttons ----------------------------------------------------
document
  .getElementById('export-single')
  ?.addEventListener('click', () =>
    exportSingleFile().catch((e) => alert('Export failed: ' + e.message)),
  );
document
  .getElementById('export-folder')
  ?.addEventListener('click', () =>
    exportFolderZip().catch((e) => alert('Export failed: ' + e.message)),
  );
