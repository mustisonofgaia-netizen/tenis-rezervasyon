/**
 * Typography — Unified text component for the entire app.
 *
 * Replaces raw `<Text>` usage. Accepts a `variant` prop that maps directly
 * to the theme's typography scale, and a `color` prop that maps to semantic
 * color tokens — removing all magic hex strings from UI code.
 *
 * Variant → token mapping:
 *  h1      36dp / extrabold  — splash titles, scoreboards
 *  h2      30dp / bold       — screen titles
 *  h3      24dp / semibold   — section / card headings
 *  body    15dp / regular    — all body copy (default)
 *  caption 11dp / regular    — helper text, timestamps, labels
 *
 * Color → token mapping:
 *  primary  → colors.text.primary   (high-contrast body)
 *  muted    → colors.text.muted     (secondary / subdued)
 *  inverse  → colors.text.inverse   (on dark/accent surfaces)
 *  success  → colors.status.success
 *  danger   → colors.status.danger
 *  warning  → colors.status.warning
 *
 * Variant styles are pre-computed via `StyleSheet.create` (runs once at module
 * load, not on every render). Only the color is resolved dynamically from the
 * theme, keeping re-render cost minimal even without `React.memo`.
 *
 * @example
 * ```tsx
 * <Typography variant="h2">Turnuvalar</Typography>
 * <Typography variant="caption" color="muted">Son güncelleme: bugün</Typography>
 * <Typography variant="body" color="danger">Rezervasyon iptal edildi.</Typography>
 * ```
 */
import React, { memo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../context/ThemeContext';
import {
  fontSizes,
  fontWeights,
  lineHeights,
  type FontWeightValue,
} from '../../theme/typography';

// ── Public types ──────────────────────────────────────────────────────────────

export type TypographyVariant = 'h1' | 'h2' | 'h3' | 'body' | 'caption';

/**
 * Semantic color aliases accepted by `<Typography color="…">`.
 * Maps to `theme.colors.text.*` or `theme.colors.status.*`.
 */
export type TypographyColor =
  | 'primary'
  | 'muted'
  | 'inverse'
  | 'success'
  | 'danger'
  | 'warning';

export interface TypographyProps extends TextProps {
  /**
   * Visual variant that determines font size, line-height, and weight.
   * @default 'body'
   */
  variant?: TypographyVariant;
  /**
   * Semantic text color from the active theme.
   * Overridden by `style.color` when both are provided (style wins via array merge).
   * @default 'primary'
   */
  color?: TypographyColor;
}

// ── Static variant styles (computed once at module load) ──────────────────────

/**
 * `StyleSheet.create` produces an opaque number ID on the native side,
 * avoiding object allocation on every render. Variant dimensions never
 * change with the theme, so they live here rather than inside the component.
 */
interface VariantTokens {
  fontSize:   number;
  lineHeight: number;
  fontWeight: FontWeightValue;
}

const VARIANT_TOKENS: Readonly<Record<TypographyVariant, VariantTokens>> = {
  h1:      { fontSize: fontSizes['4xl'], lineHeight: lineHeights['4xl'], fontWeight: fontWeights.extrabold },
  h2:      { fontSize: fontSizes['3xl'], lineHeight: lineHeights['3xl'], fontWeight: fontWeights.bold      },
  h3:      { fontSize: fontSizes['2xl'], lineHeight: lineHeights['2xl'], fontWeight: fontWeights.semibold  },
  body:    { fontSize: fontSizes.base,   lineHeight: lineHeights.base,   fontWeight: fontWeights.regular   },
  caption: { fontSize: fontSizes.xs,     lineHeight: lineHeights.xs,     fontWeight: fontWeights.regular   },
};

/**
 * Pre-flatten variant tokens into StyleSheet IDs for zero-cost style application.
 * The cast to `TextStyle` is safe because `FontWeightValue` is a subset of
 * `TextStyle['fontWeight']`, and `fontSize` / `lineHeight` are plain numbers.
 */
const VARIANT_SHEET = StyleSheet.create(
  VARIANT_TOKENS as Record<TypographyVariant, TextStyle>,
);

// ── Color resolver (pure function, no allocations) ────────────────────────────

function resolveColor(color: TypographyColor, theme: Theme): string {
  switch (color) {
    case 'primary': return theme.colors.text.primary;
    case 'muted':   return theme.colors.text.muted;
    case 'inverse': return theme.colors.text.inverse;
    case 'success': return theme.colors.status.success;
    case 'danger':  return theme.colors.status.danger;
    case 'warning': return theme.colors.status.warning;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Typography = memo<TypographyProps>(function Typography({
  variant = 'body',
  color = 'primary',
  style,
  children,
  ...rest
}: TypographyProps) {
  const { theme } = useTheme();

  /**
   * `fontFamily` resolution:
   * On iOS, the system font (SF Pro) is applied automatically when `fontFamily`
   * is omitted. Passing `'System'` explicitly can silently break font rendering
   * in some React Native builds. We only set `fontFamily` for non-system fonts
   * (i.e. Android's 'Roboto' — though it too is the default, explicit setting is safe).
   */
  const fontFamily: string | undefined =
    Platform.OS !== 'ios' ? theme.typography.fontFamilies.sans : undefined;

  const dynamicStyle: TextStyle = {
    color: resolveColor(color, theme),
    ...(fontFamily !== undefined && { fontFamily }),
  };

  return (
    <Text
      style={[VARIANT_SHEET[variant], dynamicStyle, style]}
      {...rest}
    >
      {children}
    </Text>
  );
});

Typography.displayName = 'Typography';
