/**
 * Spacing scale — all values in density-independent pixels (dp / pt).
 * Use these tokens for margin, padding, gap, and border-radius wherever
 * a fixed rhythm is needed. Prefer named tokens over magic numbers.
 */
export const spacing = {
  /** 0 — explicit zero (removes default spacing). */
  none: 0,
  /** 4 — tight chip padding, icon-to-label gap. */
  xs:   4,
  /** 8 — inner padding for compact components. */
  sm:   8,
  /** 12 — medium-tight breathing room. */
  md2:  12,
  /** 16 — default component padding, list item gap. */
  md:   16,
  /** 24 — section padding, card internal spacing. */
  lg:   24,
  /** 32 — layout-level horizontal padding, large card padding. */
  xl:   32,
  /** 48 — screen-level vertical gap between sections. */
  xxl:  48,
  /** 64 — hero sections, large decorative spacing. */
  xxxl: 64,
} as const;

export type SpacingKey   = keyof typeof spacing;
export type SpacingValue = (typeof spacing)[SpacingKey];
export type Spacing      = typeof spacing;
