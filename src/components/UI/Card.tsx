/**
 * Card — Themed surface container with three visual variants.
 *
 * Variant behaviour:
 *  • `elevated`  — uses `surface.raised` background + drop shadow.
 *                  `overflow` is kept `visible` so the shadow is never clipped.
 *  • `outlined`  — uses `surface.card` background + `border.default` stroke.
 *                  `overflow: 'hidden'` ensures child content respects the border radius.
 *  • `flat`      — uses `surface.card` background, no shadow, no border.
 *
 * Dynamic styles (`backgroundColor`, `padding`, shadow, border) are computed
 * with `useMemo` so they only recompute when the theme or a variant-related
 * prop changes — not on every parent render.
 *
 * @example
 * ```tsx
 * <Card variant="elevated" padding="lg">
 *   <Typography variant="h3">Court Booking</Typography>
 * </Card>
 * ```
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import type { SpacingKey } from '../../theme/spacing';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardVariant = 'elevated' | 'outlined' | 'flat';

export interface CardProps extends ViewProps {
  /**
   * Visual presentation of the card surface.
   * @default 'elevated'
   */
  variant?: CardVariant;
  /**
   * Inner padding mapped to the theme spacing scale.
   * @default 'md'
   */
  padding?: SpacingKey;
}

// ── Shadow helpers ────────────────────────────────────────────────────────────

interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

function buildShadow(isDark: boolean): ShadowStyle {
  return isDark
    ? {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.40,
        shadowRadius: 12,
        elevation: 6,
      }
    : {
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 12,
        elevation: 4,
      };
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Card = memo<CardProps>(function Card({
  variant = 'elevated',
  padding = 'md',
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme();

  const dynamicStyle = useMemo<ViewStyle>(() => {
    const paddingValue = theme.spacing[padding];
    const isDark = theme.colorScheme === 'dark';

    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: theme.colors.surface.raised,
          padding: paddingValue,
          // Keep overflow visible so iOS shadow is never clipped by the border radius.
          // On Android, elevation is rendered as a material shadow outside the view bounds.
          overflow: 'visible',
          ...buildShadow(isDark),
        };

      case 'outlined':
        return {
          backgroundColor: theme.colors.surface.card,
          padding: paddingValue,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border.default,
        };

      case 'flat':
        return {
          backgroundColor: theme.colors.surface.card,
          padding: paddingValue,
          overflow: 'hidden',
        };
    }
  }, [theme, variant, padding]);

  return (
    <View style={[staticStyles.base, dynamicStyle, style]} {...rest}>
      {children}
    </View>
  );
});

Card.displayName = 'Card';

// ── Static styles (invariant across themes and variants) ──────────────────────

const staticStyles = StyleSheet.create({
  base: {
    borderRadius: 16,
  },
});
