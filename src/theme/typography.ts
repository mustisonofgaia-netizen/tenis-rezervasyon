/**
 * Typography tokens.
 * Font families are platform-resolved at module load time.
 * All numeric values are in density-independent pixels (dp / pt).
 */
import { Platform } from 'react-native';

// ── Font families ─────────────────────────────────────────────────────────────

export interface FontFamilies {
  /** Primary sans-serif for all UI copy. */
  sans: string;
  /** Monospaced for code, IDs, or numeric data. */
  mono: string;
}

export const fontFamilies: FontFamilies = {
  sans: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }) ?? 'System',
  mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }) ?? 'monospace',
};

// ── Font sizes ────────────────────────────────────────────────────────────────

export const fontSizes = {
  /** 11 — captions, legal disclaimers. */
  xs:   11,
  /** 13 — helper text, secondary labels. */
  sm:   13,
  /** 15 — default body copy. */
  base: 15,
  /** 16 — slightly larger body or form labels. */
  md:   16,
  /** 18 — section headings, card titles. */
  lg:   18,
  /** 20 — screen sub-titles. */
  xl:   20,
  /** 24 — screen titles. */
  '2xl': 24,
  /** 30 — hero numbers, scores. */
  '3xl': 30,
  /** 36 — splash / marketing display text. */
  '4xl': 36,
} as const;

export type FontSizeKey = keyof typeof fontSizes;

// ── Line heights (absolute dp) ────────────────────────────────────────────────

export const lineHeights = {
  /** Pairs with xs / sm. */
  xs:   16,
  sm:   18,
  /** Pairs with base / md body copy. */
  base: 22,
  md:   24,
  /** Pairs with lg / xl headings. */
  lg:   26,
  xl:   28,
  /** Pairs with display sizes. */
  '2xl': 32,
  '3xl': 38,
  '4xl': 44,
} as const;

export type LineHeightKey = keyof typeof lineHeights;

// ── Font weights ──────────────────────────────────────────────────────────────

export const fontWeights = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
} as const;

export type FontWeightKey = keyof typeof fontWeights;
/**
 * Narrow union of all valid weight values, compatible with
 * React Native's `TextStyle['fontWeight']`.
 */
export type FontWeightValue = (typeof fontWeights)[FontWeightKey];

// ── Composed Typography object ────────────────────────────────────────────────

export interface Typography {
  fontFamilies: FontFamilies;
  fontSizes:    typeof fontSizes;
  lineHeights:  typeof lineHeights;
  fontWeights:  typeof fontWeights;
}

export const typography: Typography = {
  fontFamilies,
  fontSizes,
  lineHeights,
  fontWeights,
};
