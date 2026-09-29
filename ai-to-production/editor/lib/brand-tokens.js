// Brand-legal option data for the style popover. Pure data + helpers.
// Names verified against tokens/colors.css, tokens/typography.css, tokens/spacing.css.

export const HUES = [
  'amber','blue','cyan','fuchsia','gray','green','indigo','lime',
  'magenta','mint','orange','pink','purple','red','rose','teal','violet','yellow',
];

export const RAMP_STEPS = [50,100,200,300,400,500,600,700,800,900,1000];

// Typography classes, largest to smallest (see tokens/typography.css).
export const TYPE_RAMP = [
  'aws-h1','aws-h2','aws-h3','aws-subhead','aws-body-lg','aws-body','aws-body-sm','aws-caption',
];

export const BG_MODES = [
  { id: 'anchor-white', label: 'Anchor — white',    bg: 'var(--aws-gray-50)',  fg: 'var(--aws-gray-850)' },
  { id: 'gray-850',     label: 'Anchor — Gray 850', bg: 'var(--aws-gray-850)', fg: '#ffffff' },
  { id: 'gradient',     label: 'Gradient hero',     bg: null,                  fg: '#ffffff' },
];

/** CSS custom-property reference for a hue+step, e.g. var(--aws-orange-400). */
export function colorVar(hue, step) {
  return `var(--aws-${hue}-${step})`;
}

/**
 * Given a current type-ramp class and a direction (+1 = smaller, -1 = bigger),
 * return the adjacent ramp class, clamped at the ends. null if unknown class.
 */
export function nextTypeClass(current, dir) {
  const i = TYPE_RAMP.indexOf(current);
  if (i === -1) return null;
  const j = Math.max(0, Math.min(TYPE_RAMP.length - 1, i + dir));
  return TYPE_RAMP[j];
}
