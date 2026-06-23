/**
 * ThemeContext — Global design-system theme provider.
 *
 * Responsibilities:
 *  • Reads the initial color scheme from the OS via `Appearance.getColorScheme()`.
 *  • Subscribes to live OS-level appearance changes (light ↔ dark toggle).
 *  • Allows manual override via `setColorScheme`; persists the choice to
 *    AsyncStorage so it survives app restarts.
 *  • Exposes the fully-typed `Theme` object and the `useTheme()` hook.
 *
 * Usage:
 *  1. Wrap your root component with <ThemeProvider>.
 *  2. Call `useTheme()` anywhere inside to read the current theme.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key for the persisted color-scheme preference. */
const SCHEME_KEY = '@tenis_app:colorScheme';

import { colorsByScheme, type ColorTokens } from '../theme/tokens';
import { typography, type Typography } from '../theme/typography';
import { spacing, type Spacing } from '../theme/spacing';

// ── Domain types ──────────────────────────────────────────────────────────────

/** The two resolved scheme values. `null` from the OS always collapses to `'dark'`. */
export type ColorScheme = 'light' | 'dark';

/**
 * The single source-of-truth theme object passed through the context.
 * All fields are strictly typed — no `any`.
 */
export interface Theme {
  /** Semantic color tokens for the active color scheme. */
  colors: ColorTokens;
  /** Font families, sizes, weights, and line-heights. */
  typography: Typography;
  /** Spacing scale (dp). */
  spacing: Spacing;
  /** The currently active color scheme. */
  colorScheme: ColorScheme;
}

/** Shape of the value exposed by ThemeContext. */
export interface ThemeContextValue {
  /** Fully composed theme object. Consume via `theme.colors.*`, `theme.spacing.*`, etc. */
  theme: Theme;
  /** Convenience shortcut — identical to `theme.colorScheme`. */
  colorScheme: ColorScheme;
  /**
   * Override the color scheme for the session.
   * Overrides persist until the app restarts or `setColorScheme` is called again.
   * System changes no longer override a manual selection.
   */
  setColorScheme: (scheme: ColorScheme) => void;
  /** Toggle between `'light'` and `'dark'`. */
  toggleTheme: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve a potentially-null OS color scheme to a concrete `ColorScheme`.
 * Defaults to `'dark'` because the app ships a dark-first design language.
 */
function resolveScheme(name: ColorSchemeName): ColorScheme {
  return name === 'light' ? 'light' : 'dark';
}

function buildTheme(scheme: ColorScheme): Theme {
  return {
    colors:      colorsByScheme[scheme],
    typography,
    spacing,
    colorScheme: scheme,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
ThemeContext.displayName = 'ThemeContext';

// ── Provider ──────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Optional override to force a specific color scheme regardless of OS setting.
   * Useful for Storybook, screenshots, and automated testing.
   */
  forcedColorScheme?: ColorScheme;
}

export function ThemeProvider({
  children,
  forcedColorScheme,
}: ThemeProviderProps): React.JSX.Element {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(
    forcedColorScheme ?? resolveScheme(Appearance.getColorScheme()),
  );

  // Track whether the user has manually overridden the scheme so that
  // subsequent OS changes don't silently undo their preference.
  const [isManualOverride, setIsManualOverride] = useState(
    forcedColorScheme !== undefined,
  );

  // ── Hydrate persisted preference on mount ─────────────────────────────────
  // Skipped when forcedColorScheme is set (Storybook / automated test mode).
  useEffect(() => {
    if (forcedColorScheme !== undefined) return;

    AsyncStorage.getItem(SCHEME_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') {
          setColorSchemeState(stored);
          setIsManualOverride(true);
        }
      })
      .catch(() => {}); // silently degrade — OS preference remains active
  // Intentionally empty deps: this is a one-shot mount hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Subscribe to OS appearance changes ───────────────────────────────────
  useEffect(() => {
    if (isManualOverride) return;

    const subscription = Appearance.addChangeListener(
      ({ colorScheme: next }: { colorScheme: ColorSchemeName }) => {
        setColorSchemeState(resolveScheme(next));
      },
    );

    return () => {
      subscription.remove();
    };
  }, [isManualOverride]);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    setIsManualOverride(true);
    // Persist so the preference survives app restarts. Fire-and-forget.
    AsyncStorage.setItem(SCHEME_KEY, scheme).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, setColorScheme]);

  const theme = useMemo(() => buildTheme(colorScheme), [colorScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, colorScheme, setColorScheme, toggleTheme }),
    [theme, colorScheme, setColorScheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Access the active theme and color-scheme controls.
 *
 * @throws {Error} When called outside of a `<ThemeProvider>` tree.
 *
 * @example
 * ```tsx
 * function MyCard() {
 *   const { theme } = useTheme();
 *   return (
 *     <View style={{ backgroundColor: theme.colors.surface.card }}>
 *       <Text style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSizes.md }}>
 *         Hello
 *       </Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error(
      '[useTheme] must be called inside a <ThemeProvider>. ' +
      'Ensure ThemeProvider wraps your root component.',
    );
  }
  return context;
}
