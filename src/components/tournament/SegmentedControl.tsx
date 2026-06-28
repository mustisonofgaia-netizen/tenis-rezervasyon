/**
 * @file src/components/tournament/SegmentedControl.tsx
 *
 * Generic two-or-more segment pill control.
 * Works with any string keys — the caller owns the type narrowing.
 *
 * @example
 *   type Tab = 'explore' | 'my';
 *   const TABS: Segment[] = [
 *     { key: 'explore', label: 'Keşfet' },
 *     { key: 'my',      label: 'Turnuvalarım' },
 *   ];
 *   <SegmentedControl segments={TABS} active={tab} onSelect={(k) => setTab(k as Tab)} />
 */

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import type { ColorTokens } from '../../theme/tokens';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Segment = {
  key: string;
  label: string;
};

export type SegmentedControlProps = {
  segments: Segment[];
  active: string;
  onSelect: (key: string) => void;
  /** Horizontal margin applied to the wrapping container. Default: 20. */
  marginHorizontal?: number;
};

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyles(c: ColorTokens, marginH: number) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      backgroundColor: c.surface.card,
      borderRadius: 12,
      padding: 4,
      marginHorizontal: marginH,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 9,
    },
    tabOn:   { backgroundColor: c.accent.primary },
    label:   { fontSize: 14, fontWeight: '600', color: c.text.muted, letterSpacing: 0.2 },
    labelOn: { color: c.text.inverse, fontWeight: '800' },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SegmentedControl({
  segments,
  active,
  onSelect,
  marginHorizontal = 20,
}: SegmentedControlProps) {
  const { theme } = useTheme();
  const S = useMemo(
    () => makeStyles(theme.colors, marginHorizontal),
    [theme, marginHorizontal],
  );

  return (
    <View style={S.wrap}>
      {segments.map(({ key, label }) => {
        const on = key === active;
        return (
          <TouchableOpacity
            key={key}
            activeOpacity={0.8}
            onPress={() => onSelect(key)}
            style={[S.tab, on && S.tabOn]}
          >
            <Text style={[S.label, on && S.labelOn]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
