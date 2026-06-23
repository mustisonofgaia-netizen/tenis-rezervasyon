/**
 * Semantic color tokens.
 * Map raw palette values to intent-based names for both light and dark themes.
 * Components must consume these tokens — never the raw palette — so that
 * theme-switching requires zero component changes.
 */
import { palette } from './palette';

// ── Color token shape ─────────────────────────────────────────────────────────

export interface BackgroundTokens {
  /** Main screen / page background. */
  primary: string;
  /** Slightly offset background for nested regions. */
  secondary: string;
}

export interface SurfaceTokens {
  /** Flat card surface. */
  card: string;
  /** Elevated card surface (e.g. modals, dropdowns). */
  raised: string;
}

export interface TextTokens {
  /** High-contrast body copy. */
  primary: string;
  /** Subdued / secondary copy, placeholders. */
  muted: string;
  /** Text rendered on a colored / inverted surface. */
  inverse: string;
}

export interface BorderTokens {
  /** Default divider and input border. */
  default: string;
  /** Focused input or selected-state ring. */
  focus: string;
}

export interface StatusTokens {
  /** Positive feedback: confirmed booking, connected, online. */
  success: string;
  /** Destructive actions: cancellation, error states. */
  danger: string;
  /** Caution: pending payment, expiring session. */
  warning: string;
}

export interface AccentTokens {
  /** Primary brand accent used on CTAs and highlights. */
  primary: string;
  /** Secondary accent for supporting decorative elements. */
  secondary: string;
}

export interface ColorTokens {
  background: BackgroundTokens;
  surface:    SurfaceTokens;
  text:       TextTokens;
  border:     BorderTokens;
  status:     StatusTokens;
  accent:     AccentTokens;
}

// ── Dark theme ────────────────────────────────────────────────────────────────

export const darkColors: ColorTokens = {
  background: {
    primary:   palette.slate900,
    secondary: palette.slate950,
  },
  surface: {
    card:   palette.slate800,
    raised: palette.slate850,
  },
  text: {
    primary: palette.slate100,
    muted:   palette.slate400,
    inverse: palette.slate900,
  },
  border: {
    default: palette.slate700,
    focus:   palette.lime300,
  },
  status: {
    success: palette.green500,
    danger:  palette.red500,
    warning: palette.amber500,
  },
  accent: {
    // emerald500 (#10b981) — professional, calming, high-trust on dark backgrounds.
    // Dark slate900 text (text.inverse) achieves 7+ :1 contrast on this surface.
    primary:   palette.emerald500,
    secondary: palette.emerald600,
  },
};

// ── Light theme ───────────────────────────────────────────────────────────────

export const lightColors: ColorTokens = {
  background: {
    primary:   palette.white,
    secondary: palette.slate50,
  },
  surface: {
    card:   palette.white,
    raised: palette.slate100,
  },
  text: {
    primary: palette.slate900,
    muted:   palette.slate500,
    inverse: palette.white,
  },
  border: {
    default: palette.slate200,
    focus:   palette.blue500,
  },
  status: {
    success: palette.green600,
    danger:  palette.red600,
    warning: palette.amber600,
  },
  accent: {
    primary:   palette.green500,
    secondary: palette.lime500,
  },
};

// ── Token map by scheme ───────────────────────────────────────────────────────

export const colorsByScheme: Readonly<Record<'light' | 'dark', ColorTokens>> = {
  light: lightColors,
  dark:  darkColors,
};
