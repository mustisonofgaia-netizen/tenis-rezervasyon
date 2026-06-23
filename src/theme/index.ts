/**
 * Public API of the theme module.
 * Import everything from here — never from individual sub-modules.
 *
 * @example
 *   import { spacing, typography, darkColors } from '../theme';
 *   import type { ColorTokens, SpacingKey } from '../theme';
 */

// Palette (raw hex — internal use only; exported for tooling / documentation)
export { palette } from './palette';
export type { PaletteKey, PaletteValue } from './palette';

// Semantic color tokens
export { darkColors, lightColors, colorsByScheme } from './tokens';
export type {
  ColorTokens,
  BackgroundTokens,
  SurfaceTokens,
  TextTokens,
  BorderTokens,
  StatusTokens,
  AccentTokens,
} from './tokens';

// Typography
export { typography, fontFamilies, fontSizes, lineHeights, fontWeights } from './typography';
export type {
  Typography,
  FontFamilies,
  FontSizeKey,
  LineHeightKey,
  FontWeightKey,
  FontWeightValue,
} from './typography';

// Spacing
export { spacing } from './spacing';
export type { Spacing, SpacingKey, SpacingValue } from './spacing';
