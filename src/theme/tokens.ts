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
    // slate900 on sage400 → 6.9 : 1 — text/icons rendered ON the accent surface.
    inverse: palette.slate900,
  },
  border: {
    default: palette.slate700,
    focus:   palette.sage400,
  },
  status: {
    success: palette.green500,
    danger:  palette.red500,
    warning: palette.amber500,
  },
  accent: {
    // sage400 (#87a96b) — soft, muted sage green; calming and high-trust on dark bg.
    primary:   palette.sage400,
    secondary: palette.sage500,
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
    // #ffffff on pine600 → 5.0 : 1 — text/icons rendered ON the accent surface.
    inverse: palette.white,
  },
  border: {
    default: palette.slate200,
    focus:   palette.pine600,
  },
  status: {
    success: palette.green600,
    danger:  palette.red600,
    warning: palette.amber600,
  },
  accent: {
    // pine600 (#4f7942) — deep, rich pine green; authoritative on light backgrounds.
    primary:   palette.pine600,
    secondary: palette.sage500,
  },
};

// ── Token map by scheme ───────────────────────────────────────────────────────

export const colorsByScheme: Readonly<Record<'light' | 'dark', ColorTokens>> = {
  light: lightColors,
  dark:  darkColors,
};
