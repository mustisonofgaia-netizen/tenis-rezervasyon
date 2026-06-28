/**
 * @file src/components/tournament/TournamentCard.tsx
 *
 * Presentation-only card for a single Tournament document.
 * Callers supply an `onPress` handler; the card itself has no knowledge of
 * navigation or business logic.
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import type { ColorTokens } from '../../theme/tokens';
import type { Tournament, TournamentStatus } from '../../types/tournament';

// ─── Style helpers ────────────────────────────────────────────────────────────

function statusLabel(s: TournamentStatus): string {
  if (s === 'active')   return 'Aktif';
  if (s === 'upcoming') return 'Yakında';
  return 'Tamamlandı';
}

function statusColor(s: TournamentStatus, c: ColorTokens): string {
  if (s === 'active')   return c.status.success;
  if (s === 'upcoming') return c.status.warning;
  return c.text.muted;
}

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    pressable: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    card: {
      backgroundColor: c.surface.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      overflow: 'hidden',
    },
    cardBody: {
      padding: 16,
      gap: 12,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    titleWrap: {
      flex: 1,
      gap: 3,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    title: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.3,
    },
    typeBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: c.accent.primary + '1A',
      borderWidth: 1,
      borderColor: c.accent.primary + '3D',
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.accent.primary,
    },
    formatText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border.default,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    freePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: '#16a34a1A',
      borderWidth: 1,
      borderColor: '#16a34a3D',
    },
    freePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#16a34a',
    },
    feePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: c.surface.raised,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    feePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.primary,
    },
    scoringPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: c.surface.raised,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    scoringPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text.muted,
    },
    customScoringPill: {
      backgroundColor: c.accent.primary + '0F',
      borderColor: c.accent.primary + '3D',
    },
    customScoringPillText: {
      color: c.accent.primary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export type TournamentCardProps = {
  tournament: Tournament;
  /**
   * Called when the card is tapped. If omitted the card is non-interactive
   * (useful for loading skeletons or preview modes).
   */
  onPress?: () => void;
};

export function TournamentCard({ tournament, onPress }: TournamentCardProps) {
  const { theme } = useTheme();
  const c  = theme.colors;
  const S  = useMemo(() => makeStyles(c), [theme]);

  const isCustomScoring = tournament.scoringSystem === 'custom';
  const isPaid          = tournament.paymentMethod !== 'free';
  const sColor          = statusColor(tournament.status, c);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.72 : 1}
      onPress={onPress}
      style={S.pressable}
      disabled={!onPress}
    >
      <View style={S.card}>
        <View style={S.cardBody}>

          {/* ── Title row ──────────────────────────────────────────────── */}
          <View style={S.topRow}>
            <View style={S.titleWrap}>
              <View style={S.titleRow}>
                {tournament.visibility === 'private' && (
                  <Ionicons name="lock-closed" size={12} color={c.text.muted} />
                )}
                <Text style={S.title} numberOfLines={2}>{tournament.title}</Text>
              </View>
              <Text style={S.formatText}>{tournament.format}</Text>
            </View>

            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={S.typeBadge}>
                <Text style={S.typeBadgeText}>{tournament.type}</Text>
              </View>
              <View style={S.statusRow}>
                <View style={[S.statusDot, { backgroundColor: sColor }]} />
                <Text style={[S.statusText, { color: sColor }]}>
                  {statusLabel(tournament.status)}
                </Text>
              </View>
            </View>
          </View>

          <View style={S.divider} />

          {/* ── Feature pills ─────────────────────────────────────────── */}
          <View style={S.pillRow}>
            {!isPaid ? (
              <View style={S.freePill}>
                <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                <Text style={S.freePillText}>Ücretsiz</Text>
              </View>
            ) : (
              <View style={S.feePill}>
                <Ionicons name="card-outline" size={12} color={c.text.muted} />
                <Text style={S.feePillText}>₺{tournament.entryFee}</Text>
              </View>
            )}

            <View style={[S.scoringPill, isCustomScoring && S.customScoringPill]}>
              <Ionicons
                name={isCustomScoring ? 'flash' : 'podium-outline'}
                size={12}
                color={isCustomScoring ? c.accent.primary : c.text.muted}
              />
              <Text style={[S.scoringPillText, isCustomScoring && S.customScoringPillText]}>
                {isCustomScoring ? 'Özel Güç Puanı' : 'Klasik'}
              </Text>
            </View>
          </View>

        </View>
      </View>
    </TouchableOpacity>
  );
}
