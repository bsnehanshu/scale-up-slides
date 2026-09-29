// Pure snap-to-grid + clamp helpers for the layout-nudge mode.
// No DOM, no imports — unit-testable in Node.

/** Round `value` to the nearest multiple of `step` (px). */
export function snap(value, step = 8) {
  if (step <= 0) return value;
  return Math.max(0, Math.round(value / step) * step);
}

/**
 * Keep `box` ({x,y,width,height}) inside `parent` ({width,height}).
 * Shrinks first if larger than parent, then pulls the origin back in-bounds.
 */
export function clampBox(box, parent) {
  const width = Math.min(box.width, parent.width);
  const height = Math.min(box.height, parent.height);
  const x = Math.max(0, Math.min(box.x, parent.width - width));
  const y = Math.max(0, Math.min(box.y, parent.height - height));
  return { x, y, width, height };
}
