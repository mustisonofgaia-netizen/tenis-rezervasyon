/**
 * Raw color palette — Tailwind-calibrated hex codes.
 * Never reference these directly in UI code; always use semantic tokens instead.
 */
export const palette = {
  // ── Slate ──────────────────────────────────────────────────────────────────
  slate50:  '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate850: '#172033',
  slate900: '#0f172a',
  slate950: '#020617',

  // ── Pine & Sage (Sage & Pine brand palette) ───────────────────────────────
  // pine600 — deep, rich pine green for Light Mode accent
  //   White text on pine600 → 5.0 : 1 contrast (WCAG AA ✓)
  pine600: '#4f7942',

  // sage400 — soft, muted sage green for Dark Mode accent
  // sage500 — mid-tone used for secondary elements and subtle borders
  //   slate900 text on sage400 → 6.9 : 1 contrast (WCAG AA ✓)
  sage400: '#87a96b',
  sage500: '#749359',

  // ── Green (status / UI utilities) ─────────────────────────────────────────
  green400: '#4ade80',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',

  // ── Lime (legacy — kept for backward-compatibility) ───────────────────────
  lime300: '#bef264',
  lime400: '#a3e635',
  lime500: '#84cc16',

  // ── Blue ───────────────────────────────────────────────────────────────────
  blue400: '#60a5fa',
  blue500: '#3b82f6',
  blue600: '#2563eb',

  // ── Red ────────────────────────────────────────────────────────────────────
  red400:  '#f87171',
  red500:  '#ef4444',
  red600:  '#dc2626',

  // ── Amber ──────────────────────────────────────────────────────────────────
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',

  // ── Neutrals ───────────────────────────────────────────────────────────────
  white:       '#ffffff',
  black:       '#000000',
  transparent: 'transparent',
} as const;

export type PaletteKey = keyof typeof palette;
export type PaletteValue = (typeof palette)[PaletteKey];
