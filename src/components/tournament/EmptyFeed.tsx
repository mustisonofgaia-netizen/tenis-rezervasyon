/**
 * @file src/components/tournament/EmptyFeed.tsx
 *
 * Centred empty-state for tournament list feeds.
 * Optionally renders a primary CTA button when `cta` + `onCta` are provided.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';

// ─── Component ────────────────────────────────────────────────────────────────

export type EmptyFeedProps = {
  message: string;
  /** Label for an optional primary action button. Requires `onCta`. */
  cta?: string;
  onCta?: () => void;
};

export function EmptyFeed({ message, cta, onCta }: EmptyFeedProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={styles.root}>
      <Ionicons name="tennisball-outline" size={52} color={c.border.default} />
      <Text style={[styles.message, { color: c.text.muted }]}>{message}</Text>

      {cta && onCta && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCta}
          style={[styles.ctaBtn, {
            backgroundColor: c.accent.primary,
            shadowColor: c.accent.primary,
          }]}
        >
          <Ionicons name="add-circle-outline" size={16} color={c.text.inverse} />
          <Text style={[styles.ctaText, { color: c.text.inverse }]}>{cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Static styles — no colour dependency, so defined outside the component.

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    gap: 14,
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaBtn: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
