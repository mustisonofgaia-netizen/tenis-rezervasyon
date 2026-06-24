import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import { resolveFullCourtLabel } from '../config/data';
import { cancelBooking, subscribeToUserBookings } from '../services/bookingService';
import { subscribeToMyJoinedMatches } from '../services/matchService';
import type { ConfirmedBooking } from '../types/booking';
import type { MatchDocument } from '../types/match';
import { MatchDetailsModal } from '../components/MatchDetailsModal';
import type { MatchBookingDetails } from '../components/MatchDetailsModal';
import { PublishMatchModal } from '../components/PublishMatchModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD     = 80;
const SNAP_OPEN           = 100;
const SLIDE_EXIT          = -400;
const DELETE_ACTION_WIDTH = SNAP_OPEN;
const SPRING_CONFIG       = { mass: 0.2, damping: 15, stiffness: 120 } as const;
const STAGGER_MS          = 70;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBookingDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function isWithin24Hours(date: string, slotTime: string): boolean {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute]     = slotTime.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime() - Date.now() < 24 * 60 * 60 * 1000;
}

function resolveCourtName(courtId: string): string {
  return resolveFullCourtLabel(courtId);
}

// ─── Feed item union type ─────────────────────────────────────────────────────

type ActivityItem =
  | { kind: 'booking';     id: string; booking: ConfirmedBooking; match: MatchDocument | null }
  | { kind: 'joinedMatch'; id: string; match: MatchDocument };

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens, isDark: boolean) {
  return StyleSheet.create({
    safeArea:        { flex: 1, backgroundColor: c.background.secondary },
    loaderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listWrapper:     { flex: 1 },

    // ── Static header ────────────────────────────────────────────────────────
    staticHeader: {
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 4,
      backgroundColor: c.background.secondary,
    },
    header: {
      fontSize: 28,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.5,
      marginBottom: 16,
    },

    // ── Segmented control ────────────────────────────────────────────────────
    segWrapper: {
      flexDirection: 'row',
      backgroundColor: c.surface.raised,
      borderRadius: 18,
      padding: 5,
      marginBottom: 12,
    },
    segTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 14,
      gap: 6,
    },
    segTabActive:     { backgroundColor: c.accent.primary },
    segTabText:       { fontSize: 13, fontWeight: '700', color: c.text.muted, letterSpacing: 0.1 },
    segTabTextActive: { color: c.text.inverse },
    segCount: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : c.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    segCountActive: {
      backgroundColor: isDark ? 'rgba(15,23,42,0.20)' : 'rgba(255,255,255,0.25)',
    },
    segCountText:       { fontSize: 11, fontWeight: '800', color: c.text.muted },
    segCountTextActive: { color: c.text.inverse },

    // ── List ─────────────────────────────────────────────────────────────────
    listContent:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
    listContentEmpty: { flexGrow: 1 },

    // ── Activity type badge (available for external use) ─────────────────────
    typeBadge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 10,
    },
    typeBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
    },

    // ── Swipe row ────────────────────────────────────────────────────────────
    swipeRow:     { marginBottom: 14 },
    deleteAction: {
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: DELETE_ACTION_WIDTH,
      backgroundColor: c.status.danger,
      borderTopRightRadius: 18, borderBottomRightRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    deleteActionContent: { alignItems: 'center', gap: 5 },
    deleteActionIcon:    { fontSize: 22 },
    // White is mandatory: this label always sits on the danger-red surface.
    deleteActionLabel:   { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },

    // ── Booking card shell ────────────────────────────────────────────────────
    card: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border.default,
      borderLeftWidth: 4,
      shadowColor: c.text.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },

    // ── TICKET SECTION (top half) ─────────────────────────────────────────────
    ticketHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 12,
    },
    facilityName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.text.primary,
      lineHeight: 22,
    },
    badge: {
      backgroundColor: c.status.success + '1A',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.status.success,
      letterSpacing: 0.3,
    },
    ticketMeta: {
      flexDirection: 'row',
    },
    ticketMetaItem: {
      flex: 1,
      gap: 3,
    },
    ticketMetaDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: c.border.default,
      marginHorizontal: 16,
      marginVertical: 2,
    },
    infoLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    infoValue: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text.primary,
    },

    // ── Ticket tear separator (dashed hairline) ───────────────────────────────
    ticketSeparator: {
      borderTopWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border.default,
      marginVertical: 14,
    },

    // ── ACTION PANEL — STATE A: Ghost "Oyuncu Ara" CTA ───────────────────────
    findPlayersGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      backgroundColor: c.surface.raised,
    },
    findPlayersGhostLeft: {
      gap: 1,
    },
    findPlayersGhostLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accent.primary,
    },
    findPlayersGhostHint: {
      fontSize: 11,
      color: c.text.muted,
    },
    findPlayersGhostArrow: {
      fontSize: 20,
      color: c.text.muted,
    },

    // ── ACTION PANEL — STATE B: Active Match Lobby ────────────────────────────
    matchLobbyPanel: {
      backgroundColor: c.status.warning + '14',
      borderRadius: 12,
      padding: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: c.status.warning + '33',
    },
    matchLobbyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    matchLobbyTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.status.warning,
    },
    matchSlotBadge: {
      backgroundColor: c.status.warning + '22',
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: c.status.warning + '44',
    },
    matchSlotText: {
      fontSize: 12,
      fontWeight: '800',
      color: c.status.warning,
    },
    matchLobbyCta: {
      fontSize: 12,
      fontWeight: '600',
      color: c.status.warning,
      opacity: 0.85,
    },

    // ── Joined-match card ─────────────────────────────────────────────────────
    joinedCardWrapper: { marginBottom: 14 },
    joinedCard: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.accent.secondary + '33',
      borderLeftWidth: 4,
      borderLeftColor: c.accent.secondary,
      shadowColor: c.text.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },

    // ── Joined card: status row ───────────────────────────────────────────────
    joinedStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    joinedStatusBadge: {
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    joinedStatusOpen:     { backgroundColor: c.status.success + '1A' },
    joinedStatusFull:     { backgroundColor: c.status.warning + '1A' },
    joinedStatusTextOpen: { fontSize: 12, fontWeight: '700', color: c.status.success, letterSpacing: 0.3 },
    joinedStatusTextFull: { fontSize: 12, fontWeight: '700', color: c.status.warning, letterSpacing: 0.3 },
    joinedParticipantLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.accent.secondary,
    },

    // ── Player slot display (socially prominent) ──────────────────────────────
    joinedSlotSection: {
      alignItems: 'center',
      paddingVertical: 10,
      gap: 8,
    },
    joinedSlotCountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    joinedSlotNumber: {
      fontSize: 34,
      fontWeight: '800',
      color: c.text.primary,
      letterSpacing: -1,
    },
    joinedSlotDivider: {
      fontSize: 20,
      fontWeight: '500',
      color: c.text.muted,
      marginHorizontal: 2,
    },
    joinedSlotTotal: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text.muted,
    },
    joinedSlotLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    joinedDotRow: {
      flexDirection: 'row',
      gap: 7,
    },
    playerDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.border.default,
    },
    playerDotFilled: {
      backgroundColor: c.accent.secondary,
    },

    // ── Joined card: secondary info ───────────────────────────────────────────
    joinedCourtSection: {
      gap: 4,
    },
    joinedCourtName: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text.primary,
    },
    joinedMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    joinedMetaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: c.text.muted,
    },
    joinedMetaText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
    },

    // ── Joined card: CTA row ──────────────────────────────────────────────────
    joinedCtaRow: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border.default,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    joinedCtaLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accent.secondary,
    },
    joinedCtaArrow: {
      fontSize: 18,
      color: c.accent.secondary,
    },

    // ── Empty state ───────────────────────────────────────────────────────────
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text.primary,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 22,
      color: c.text.muted,
      textAlign: 'center',
    },
  });
}

// ─── Activity type badge ──────────────────────────────────────────────────────

type ActivityKind = 'pure' | 'hosted' | 'joined';

function TypeBadge({ kind }: { kind: ActivityKind }) {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;

  const configs: Record<ActivityKind, { label: string; bg: string; text: string; border: string }> = {
    pure: {
      label:  '📋 Sadece Rezervasyon',
      bg:     c.surface.raised,
      text:   c.text.muted,
      border: c.border.default,
    },
    hosted: {
      label:  '👑 Sizin İlanınız (Kurucu)',
      bg:     c.accent.primary + '14',
      text:   c.accent.primary,
      border: c.accent.primary + '33',
    },
    joined: {
      label:  '🎾 Katılımcı',
      bg:     c.accent.secondary + '14',
      text:   c.accent.secondary,
      border: c.accent.secondary + '33',
    },
  };

  const cf = configs[kind];
  const S  = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);
  return (
    <View style={[S.typeBadge, { backgroundColor: cf.bg, borderColor: cf.border }]}>
      <Text style={[S.typeBadgeText, { color: cf.text }]}>{cf.label}</Text>
    </View>
  );
}

// ─── Swipeable booking card ───────────────────────────────────────────────────

type SwipeableBookingCardProps = {
  booking:       ConfirmedBooking;
  onFindPlayers: (booking: ConfirmedBooking) => void;
  onViewMatch:   (match: MatchDocument) => void;
  activeMatch:   MatchDocument | null;
  entryDelay:    number;
};

function SwipeableBookingCard({
  booking,
  onFindPlayers,
  onViewMatch,
  activeMatch,
  entryDelay,
}: SwipeableBookingCardProps) {
  const { uid }                = useAuth();
  const { theme, colorScheme } = useTheme();
  const c                      = theme.colors;
  const S                      = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);
  const translateX             = useSharedValue(0);

  // Amber left-accent signals an active lobby; neutral means plain booking.
  const accentColor = activeMatch ? c.status.warning : c.border.default;

  const doCancel = useCallback(() => {
    cancelBooking(booking.date, booking.slotTime, uid, booking.courtId).catch(() => {
      translateX.value = withSpring(0, SPRING_CONFIG);
      Alert.alert('Hata', 'İptal işlemi başarısız oldu. Lütfen tekrar deneyin.');
    });
  }, [booking.courtId, booking.date, booking.slotTime, translateX, uid]);

  const handleCancelAttempt = useCallback(() => {
    if (isWithin24Hours(booking.date, booking.slotTime)) {
      translateX.value = withSpring(0, SPRING_CONFIG);
      Alert.alert('İptal Süresi Geçti', 'Maç saatine 24 saatten az kaldığı için bu rezervasyon iptal edilemez.');
      return;
    }
    Alert.alert(
      'Rezervasyon İptali',
      'Bu kort rezervasyonunu iptal etmek istediğinize emin misiniz? Ücret iade süreciniz başlatılacaktır.',
      [
        { text: 'Vazgeç', style: 'cancel', onPress: () => { translateX.value = withSpring(0, SPRING_CONFIG); } },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: () => {
            translateX.value = withTiming(SLIDE_EXIT, { duration: 280 }, (finished) => {
              'worklet';
              if (finished) runOnJS(doCancel)();
            });
          },
        },
      ],
    );
  }, [booking.date, booking.slotTime, doCancel, translateX]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const raw = Math.min(0, e.translationX);
          translateX.value = raw < -SNAP_OPEN ? -SNAP_OPEN + (raw + SNAP_OPEN) * 0.15 : raw;
        })
        .onEnd(() => {
          if (translateX.value < -SWIPE_THRESHOLD) {
            translateX.value = withSpring(-SNAP_OPEN, SPRING_CONFIG);
            runOnJS(handleCancelAttempt)();
          } else {
            translateX.value = withSpring(0, SPRING_CONFIG);
          }
        }),
    [handleCancelAttempt, translateX],
  );

  const cardStyle   = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const actionStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(translateX.value) / SNAP_OPEN);
    return { opacity: p, transform: [{ scale: 0.75 + p * 0.25 }] };
  });

  return (
    <Animated.View
      entering={FadeInDown.delay(entryDelay).duration(400).easing(Easing.out(Easing.cubic))}
      exiting={FadeOut.duration(280)}
      style={S.swipeRow}
    >
      {/* Red delete panel */}
      <View style={S.deleteAction}>
        <Animated.View style={[S.deleteActionContent, actionStyle]}>
          <Text style={S.deleteActionIcon}>🗑️</Text>
          <Text style={S.deleteActionLabel}>İptal Et</Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[S.card, { borderLeftColor: accentColor }, cardStyle]}>

          {/* ── SECTION 1: THE BOOKING TICKET ───────────────────────────── */}
          <View style={S.ticketHeader}>
            <Text style={S.facilityName}>{resolveCourtName(booking.courtId)}</Text>
            <View style={S.badge}>
              <Text style={S.badgeText}>Onaylandı</Text>
            </View>
          </View>

          <View style={S.ticketMeta}>
            <View style={S.ticketMetaItem}>
              <Text style={S.infoLabel}>Tarih</Text>
              <Text style={S.infoValue}>{formatBookingDate(booking.date)}</Text>
            </View>
            <View style={S.ticketMetaDivider} />
            <View style={S.ticketMetaItem}>
              <Text style={S.infoLabel}>Saat</Text>
              <Text style={S.infoValue}>{booking.slotTime}</Text>
            </View>
          </View>

          {/* ── SEPARATOR ────────────────────────────────────────────────── */}
          <View style={S.ticketSeparator} />

          {/* ── SECTION 2: ACTION / MATCH PANEL ─────────────────────────── */}
          {activeMatch ? (
            // STATE B: Active social lobby — amber tint, pops visually
            <TouchableOpacity
              style={S.matchLobbyPanel}
              activeOpacity={0.75}
              onPress={() => onViewMatch(activeMatch)}
            >
              <View style={S.matchLobbyHeader}>
                <Text style={S.matchLobbyTitle}>📢  İlan Yayında</Text>
                <View style={S.matchSlotBadge}>
                  <Text style={S.matchSlotText}>
                    {activeMatch.joinedPlayers.length}/{activeMatch.requiredPlayers}{' '}Oyuncu
                  </Text>
                </View>
              </View>
              <Text style={S.matchLobbyCta}>İlan Detaylarını Gör  →</Text>
            </TouchableOpacity>
          ) : (
            // STATE A: Plain booking — low-profile ghost CTA
            <TouchableOpacity
              style={S.findPlayersGhost}
              activeOpacity={0.7}
              onPress={() => onFindPlayers(booking)}
            >
              <View style={S.findPlayersGhostLeft}>
                <Text style={S.findPlayersGhostLabel}>+ Oyuncu Ara</Text>
                <Text style={S.findPlayersGhostHint}>İsteğe bağlı · Maç ilanı oluştur</Text>
              </View>
              <Text style={S.findPlayersGhostArrow}>›</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// ─── Joined-match card ────────────────────────────────────────────────────────

type JoinedMatchCardProps = {
  match:         MatchDocument;
  onViewDetails: () => void;
  entryDelay:    number;
};

function JoinedMatchCard({ match, onViewDetails, entryDelay }: JoinedMatchCardProps) {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);

  const courtName   = resolveCourtName(match.courtId);
  const isFull      = match.status === 'FULL';
  const filledCount = match.joinedPlayers.length;
  const totalCount  = match.requiredPlayers;

  return (
    <Animated.View
      entering={FadeInDown.delay(entryDelay).duration(400).easing(Easing.out(Easing.cubic))}
      style={S.joinedCardWrapper}
    >
      {/* No swipe gesture — guests cannot cancel someone else's booking. */}
      <TouchableOpacity activeOpacity={0.78} onPress={onViewDetails} style={S.joinedCard}>

        {/* ── Status row ──────────────────────────────────────────────── */}
        <View style={S.joinedStatusRow}>
          <View style={[S.joinedStatusBadge, isFull ? S.joinedStatusFull : S.joinedStatusOpen]}>
            <Text style={isFull ? S.joinedStatusTextFull : S.joinedStatusTextOpen}>
              {isFull ? '● Dolu' : '● Açık'}
            </Text>
          </View>
          <Text style={S.joinedParticipantLabel}>🎾 Katılımcı</Text>
        </View>

        {/* ── Player slot display (socially prominent) ────────────────── */}
        <View style={S.joinedSlotSection}>
          <View style={S.joinedSlotCountRow}>
            <Text style={S.joinedSlotNumber}>{filledCount}</Text>
            <Text style={S.joinedSlotDivider}>/</Text>
            <Text style={S.joinedSlotTotal}>{totalCount}</Text>
          </View>
          <Text style={S.joinedSlotLabel}>Oyuncu Katıldı</Text>
          <View style={S.joinedDotRow}>
            {Array.from({ length: Math.max(0, totalCount) }).map((_, i) => (
              <View
                key={i}
                style={[S.playerDot, i < filledCount && S.playerDotFilled]}
              />
            ))}
          </View>
        </View>

        {/* ── Court & time (de-emphasized secondary info) ─────────────── */}
        <View style={S.joinedCourtSection}>
          <Text style={S.joinedCourtName}>{courtName}</Text>
          <View style={S.joinedMetaRow}>
            <Text style={S.joinedMetaText}>{formatBookingDate(match.date)}</Text>
            <View style={S.joinedMetaDot} />
            <Text style={S.joinedMetaText}>{match.slotTime}</Text>
          </View>
        </View>

        {/* ── CTA row ─────────────────────────────────────────────────── */}
        <View style={S.joinedCtaRow}>
          <Text style={S.joinedCtaLabel}>Maç Detaylarını Gör</Text>
          <Text style={S.joinedCtaArrow}>›</Text>
        </View>

      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Segmented Control ────────────────────────────────────────────────────────

const TABS = ['Rezervasyonlarım', 'Katıldığım Maçlar'] as const;

type SegmentedControlProps = {
  activeIndex: number;
  onChange: (index: number) => void;
  counts: [number, number];
};

function SegmentedControl({ activeIndex, onChange, counts }: SegmentedControlProps) {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);

  return (
    <View style={S.segWrapper}>
      {TABS.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onChange(i)}
            style={[S.segTab, isActive && S.segTabActive]}
            activeOpacity={0.75}
          >
            <Text style={[S.segTabText, isActive && S.segTabTextActive]}>
              {label}
            </Text>
            {counts[i] > 0 && (
              <View style={[S.segCount, isActive && S.segCountActive]}>
                <Text style={[S.segCountText, isActive && S.segCountTextActive]}>
                  {counts[i]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MyBookingsScreen() {
  const { uid } = useAuth();
  const { requireVerification } = useVerificationGuard();
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);

  // ── Tab navigation ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = useCallback((tab: number) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [activeTab]);

  // ── Data state ────────────────────────────────────────────────────────────
  const [bookings,      setBookings]      = useState<ConfirmedBooking[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<MatchDocument[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isRefreshing,  setIsRefreshing]  = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [selectedBookingForMatch, setSelectedBookingForMatch] =
    useState<ConfirmedBooking | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // ── Derived data ──────────────────────────────────────────────────────────

  const hostedMatchByBookingId = useMemo(
    () => new Map(joinedMatches.filter((m) => m.hostId === uid).map((m) => [m.bookingId, m])),
    [joinedMatches, uid],
  );

  const selectedMatch = useMemo(
    () => (selectedMatchId ? (joinedMatches.find((m) => m.id === selectedMatchId) ?? null) : null),
    [joinedMatches, selectedMatchId],
  );

  const selectedMatchBookingDetails = useMemo((): MatchBookingDetails | null => {
    if (!selectedMatch) return null;
    return {
      courtName: resolveCourtName(selectedMatch.courtId),
      date:      selectedMatch.date,
      slotTime:  selectedMatch.slotTime,
    };
  }, [selectedMatch]);

  // ── Tab 0: Rezervasyonlarım ───────────────────────────────────────────────
  const reservationsTabItems = useMemo((): ActivityItem[] =>
    bookings.map((b) => ({
      kind:    'booking',
      id:      `booking-${b.id}`,
      booking: b,
      match:   hostedMatchByBookingId.get(b.id) ?? null,
    })),
  [bookings, hostedMatchByBookingId]);

  // ── Tab 1: Katıldığım Maçlar (participant only, not host) ─────────────────
  const joinedTabItems = useMemo((): ActivityItem[] =>
    joinedMatches
      .filter((m) => m.hostId !== uid)
      .map((m) => ({ kind: 'joinedMatch', id: `match-${m.id}`, match: m })),
  [joinedMatches, uid]);

  const activeItems = activeTab === 0 ? reservationsTabItems : joinedTabItems;

  // ── Subscriptions ─────────────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToUserBookings(uid, (next) => {
      setBookings(next);
      setIsLoading(false);
      setIsRefreshing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => subscribeToMyJoinedMatches(uid, setJoinedMatches), [uid]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 700);
  }, []);

  const openMatchDetails = useCallback((match: MatchDocument) => {
    setSelectedMatchId(match.id);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={S.safeArea}>
        <View style={S.loaderContainer}>
          <ActivityIndicator size="large" color={c.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const emptyMessages = [
    {
      title: 'Henüz rezervasyon yok',
      body:  "Bir kort rezerve etmek için 'Keşfet' sekmesini kullanın.",
    },
    {
      title: 'Henüz katıldığınız maç yok',
      body:  "Lobi sekmesinden açık maçlara katılabilirsiniz.",
    },
  ] as const;

  return (
    <SafeAreaView style={S.safeArea}>
      {/* ── Static header — never re-mounts ─────────────────────────────── */}
      <View style={S.staticHeader}>
        <Text style={S.header}>Etkinliklerim</Text>
        <SegmentedControl
          activeIndex={activeTab}
          onChange={handleTabChange}
          counts={[reservationsTabItems.length, joinedTabItems.length]}
        />
      </View>

      {/* ── List — stays mounted across tab switches.
           key intentionally omitted to preserve the view recycler pool.
           itemLayoutAnimation drives smooth per-cell transitions when
           activeItems swaps between the two data arrays.            ── */}
      <Animated.View style={S.listWrapper}>
        <Animated.FlatList<ActivityItem>
          data={activeItems}
          keyExtractor={(item) => item.id}
          itemLayoutAnimation={LinearTransition.springify().mass(0.8)}
          contentContainerStyle={[
            S.listContent,
            activeItems.length === 0 && S.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={c.accent.primary}
              colors={[c.accent.primary]}
            />
          }
          ListEmptyComponent={
            <View style={S.emptyState}>
              <Text style={S.emptyTitle}>
                {emptyMessages[activeTab]?.title}
              </Text>
              <Text style={S.emptyText}>
                {emptyMessages[activeTab]?.body}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const delay = index * STAGGER_MS;
            if (item.kind === 'booking') {
              return (
                <SwipeableBookingCard
                  booking={item.booking}
                  onFindPlayers={(booking) =>
                    requireVerification(() => setSelectedBookingForMatch(booking))
                  }
                  onViewMatch={openMatchDetails}
                  activeMatch={item.match}
                  entryDelay={delay}
                />
              );
            }
            return (
              <JoinedMatchCard
                match={item.match}
                onViewDetails={() => openMatchDetails(item.match)}
                entryDelay={delay}
              />
            );
          }}
        />
      </Animated.View>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {selectedBookingForMatch && (
        <PublishMatchModal
          isVisible
          booking={selectedBookingForMatch}
          onClose={() => setSelectedBookingForMatch(null)}
        />
      )}

      {selectedMatch && selectedMatchBookingDetails && (
        <MatchDetailsModal
          isVisible
          match={selectedMatch}
          bookingDetails={selectedMatchBookingDetails}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </SafeAreaView>
  );
}
