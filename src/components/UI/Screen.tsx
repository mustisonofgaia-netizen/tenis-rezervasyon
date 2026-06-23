/**
 * Screen — Root safe-area container for every app screen.
 *
 * Wraps content in `SafeAreaView` from `react-native-safe-area-context`
 * (requires `<SafeAreaProvider>` at the tree root — already present in App.tsx).
 * Dynamically sets `backgroundColor` from the active theme token so that
 * the status-bar letterbox and home-indicator areas always match the screen.
 *
 * @example Static screen
 * ```tsx
 * <Screen>
 *   <View>…</View>
 * </Screen>
 * ```
 *
 * @example Scrollable screen, custom edges
 * ```tsx
 * <Screen scrollable edges={['top', 'bottom']}>
 *   <HeavyList />
 * </Screen>
 * ```
 */
import React, { memo } from 'react';
import {
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../../context/ThemeContext';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ScreenProps extends ViewProps {
  /**
   * Wraps children in a `<ScrollView>`.
   * Use `contentContainerStyle` to pad the inner scroll region.
   * @default false
   */
  scrollable?: boolean;
  /**
   * Which device edges should receive safe-area inset padding.
   * @default ['top', 'bottom', 'left', 'right']
   */
  edges?: readonly Edge[];
  /**
   * Applied to the `ScrollView`'s `contentContainerStyle`.
   * Only effective when `scrollable={true}`.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Any extra props forwarded to the inner `<ScrollView>`.
   * `contentContainerStyle` is excluded here (use the dedicated prop above).
   * Only effective when `scrollable={true}`.
   */
  scrollViewProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'style'>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Screen = memo<ScreenProps>(function Screen({
  children,
  scrollable = false,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  contentContainerStyle,
  scrollViewProps,
  ...rest
}: ScreenProps) {
  const { theme } = useTheme();

  const bgStyle: ViewStyle = { backgroundColor: theme.colors.background.primary };

  if (scrollable) {
    return (
      <SafeAreaView edges={edges} style={[styles.fill, bgStyle, style]} {...rest}>
        <ScrollView
          style={[styles.fill, styles.transparent]}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.fill, bgStyle, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
});

Screen.displayName = 'Screen';

// ── Static styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  /** Explicit transparent so the SafeAreaView's background shows through during iOS bounce. */
  transparent: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },
});
