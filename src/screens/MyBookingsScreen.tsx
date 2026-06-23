import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

/**
 * `ACCENT_JOINED` is a semantic indicator colour (blue = participant).
 * It stays fixed across light and dark mode.
 */
const ACCENT_JOINED = '#3B82F6';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

    // ── Static header + segmented control ──────────────────────────────────
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

    // ── Segmented control ───────────────────────────────────────────────────
    // The track uses `surface.raised` so it adapts: elevated dark (dark mode)
    // vs. light grey (light mode). The active pill is always accent.primary.
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
    segTabActive:         { backgroundColor: c.accent.primary },
    segTabText:           { fontSize: 13, fontWeight: '700', color: c.text.muted, letterSpacing: 0.1 },
    segTabTextActive:     { color: c.text.inverse },
    segCount: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      // Subtle tint on the inactive tab track.
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : c.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    segCountActive: {
      // On the accent pill: dark overlay in dark mode, light overlay in light mode.
      backgroundColor: isDark ? 'rgba(15,23,42,0.20)' : 'rgba(255,255,255,0.25)',
    },
    segCountText:       { fontSize: 11, fontWeight: '800', color: c.text.muted },
    segCountTextActive: { color: c.text.inverse },

    // ── List ───────────────────────────────────────────────────────────────
    listContent:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
    listContentEmpty: { flexGrow: 1 },

    // ── Activity type badge ─────────────────────────────────────────────────
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

    // ── Swipe row ───────────────────────────────────────────────────────────
    swipeRow:    { marginBottom: 14 },
    deleteAction: {
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: DELETE_ACTION_WIDTH,
      // Delete action is always red — semantic danger colour.
      backgroundColor: c.status.danger,
      borderTopRightRadius: 18, borderBottomRightRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    deleteActionContent: { alignItems: 'center', gap: 5 },
    deleteActionIcon:    { fontSize: 22 },
    // Label is always white since it sits on the danger (red) surface.
    deleteActionLabel:   { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },

    // ── Base card (booking, swipeable) ──────────────────────────────────────
    card: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border.default,
      borderLeftWidth: 4,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },

    // ── Joined-match card ───────────────────────────────────────────────────
    joinedCardWrapper: { marginBottom: 14 },
    joinedCard: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      // Blue accent border — semantic to "joined" activity type, stays blue.
      borderColor: 'rgba(59,130,246,0.25)',
      borderLeftWidth: 4,
      borderLeftColor: ACCENT_JOINED,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },

    // ── Shared card anatomy ─────────────────────────────────────────────────
    cardHeader: {
      flexDirection: 'row', alignItems: 'flex-start',
      justifyContent: 'space-between', marginBottom: 16, gap: 12,
    },
    facilityName: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text.primary, lineHeight: 22 },
    badge: {
      // "Onaylandı" badge — success tint.
      backgroundColor: c.status.success + '1A',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    badgeFull:     { backgroundColor: c.status.warning + '1A' },
    badgeText:     { fontSize: 12, fontWeight: '700', color: c.status.success, letterSpacing: 0.3 },
    // "Dolu" badge text: use warning token in dark (bright amber), deep amber in light
    // so it remains readable against the pale warning tint background.
    badgeTextFull: { color: isDark ? c.status.warning : '#92400E' },
    cardBody:      { gap: 12 },
    infoBlock:     { gap: 4 },
    infoLabel:     { fontSize: 12, fontWeight: '600', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
    infoValue:     { fontSize: 15, fontWeight: '600', color: c.text.primary },

    // ── Card footer (CTA row) ───────────────────────────────────────────────
    cardFooter: {
      marginTop: 16, paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.default,
    },
    findPlayersButton: {
      // Accent tint CTA — "find players" button.
      backgroundColor: c.accent.primary + '14',
      borderRadius: 12, paddingVertical: 11, alignItems: 'center',
    },
    findPlayersText:  { fontSize: 13, fontWeight: '700', color: c.accent.primary, letterSpacing: 0.2 },
    activeMatchBadge: {
      // "Maç Yayında" badge — warning/amber tint.
      backgroundColor: c.status.warning + '14',
      borderRadius: 12,
      paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center',
      borderWidth: 1, borderColor: c.status.warning + '33',
    },
    activeMatchText:  {
      fontSize: 13, fontWeight: '700',
      color: isDark ? c.status.warning : '#92400E',
      letterSpacing: 0.1,
    },
    joinedBadgeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // Joined badge text: always blue (semantic "participant" indicator).
    joinedBadgeText:  { fontSize: 13, fontWeight: '600', color: ACCENT_JOINED },
    viewDetailsHint:  { fontSize: 12, fontWeight: '600', color: ACCENT_JOINED },

    // ── Empty state ─────────────────────────────────────────────────────────
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.text.primary, marginBottom: 8, textAlign: 'center' },
    emptyText:  { fontSize: 14, lineHeight: 22, color: c.text.muted, textAlign: 'center' },
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
      // Blue is the fixed semantic colour for "participant".
      label:  '🎾 Katılımcı',
      bg:     'rgba(59,130,246,0.08)',
      text:   '#3B82F6',
      border: 'rgba(59,130,246,0.25)',
    },
  };

  const cf = configs[kind];
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);
  return (
    <View style={[S.typeBadge, { backgroundColor: cf.bg, borderColor: cf.border }]}>
      <Text style={[S.typeBadgeText, { color: cf.text }]}>{cf.label}</Text>
    </View>
  );
}

// ─── Swipeable booking card ───────────────────────────────────────────────────

type SwipeableBookingCardProps = {
  booking:    ConfirmedBooking;
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
  const { uid }                  = useAuth();
  const { theme, colorScheme }   = useTheme();
  const c                        = theme.colors;
  const isDark                   = colorScheme === 'dark';
  const S          = useMemo(() => makeStyles(c, isDark), [theme]);
  const translateX = useSharedValue(0);

  // Adapt accent colors to the active theme.
  const accentColor  = activeMatch ? c.accent.primary : c.border.default;
  const activityKind: ActivityKind = activeMatch ? 'hosted' : 'pure';

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
          <TypeBadge kind={activityKind} />

          <View style={S.cardHeader}>
            <Text style={S.facilityName}>{resolveCourtName(booking.courtId)}</Text>
            <View style={S.badge}>
              <Text style={S.badgeText}>Onaylandı</Text>
            </View>
          </View>

          <View style={S.cardBody}>
            <View style={S.infoBlock}>
              <Text style={S.infoLabel}>Tarih</Text>
              <Text style={S.infoValue}>{formatBookingDate(booking.date)}</Text>
            </View>
            <View style={S.infoBlock}>
              <Text style={S.infoLabel}>Saat</Text>
              <Text style={S.infoValue}>{booking.slotTime}</Text>
            </View>
          </View>

          <View style={S.cardFooter}>
            {activeMatch ? (
              <TouchableOpacity
                style={S.activeMatchBadge}
                activeOpacity={0.75}
                onPress={() => onViewMatch(activeMatch)}
              >
                <Text style={S.activeMatchText}>
                  {'📢  İlan Yayında · '}
                  {activeMatch.joinedPlayers.length}/{activeMatch.requiredPlayers}
                  {' Oyuncu  →'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={S.findPlayersButton}
                activeOpacity={0.75}
                onPress={() => onFindPlayers(booking)}
              >
                <Text style={S.findPlayersText}>🎾  Oyuncu Ara</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// ─── Joined-match card ────────────────────────────────────────────────────────

type JoinedMatchCardProps = {
  match:       MatchDocument;
  onViewDetails: () => void;
  entryDelay:  number;
};

function JoinedMatchCard({ match, onViewDetails, entryDelay }: JoinedMatchCardProps) {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme]);

  const courtName = resolveCourtName(match.courtId);
  const isFull    = match.status === 'FULL';

  return (
    <Animated.View
      entering={FadeInDown.delay(entryDelay).duration(400).easing(Easing.out(Easing.cubic))}
      style={S.joinedCardWrapper}
    >
      <TouchableOpacity activeOpacity={0.78} onPress={onViewDetails} style={S.joinedCard}>
        <TypeBadge kind="joined" />

        <View style={S.cardHeader}>
          <Text style={S.facilityName}>{courtName}</Text>
          <View style={[S.badge, isFull && S.badgeFull]}>
            <Text style={[S.badgeText, isFull && S.badgeTextFull]}>
              {isFull ? 'Dolu' : 'Açık'}
            </Text>
          </View>
        </View>

        <View style={S.cardBody}>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Tarih</Text>
            <Text style={S.infoValue}>{formatBookingDate(match.date)}</Text>
          </View>
          <View style={S.infoBlock}>
            <Text style={S.infoLabel}>Saat</Text>
            <Text style={S.infoValue}>{match.slotTime}</Text>
          </View>
        </View>

        <View style={S.cardFooter}>
          <View style={S.joinedBadgeRow}>
            <Text style={S.joinedBadgeText}>
              {match.joinedPlayers.length}/{match.requiredPlayers} Oyuncu
            </Text>
            <Text style={S.viewDetailsHint}>Detayları Gör →</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Segmented Control ────────────────────────────────────────────────────────

const TABS = ['Rezervasyonlarım', 'Katıldıklarım'] as const;

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

  // ── Tab navigation ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);
  const prevTabRef = useRef(0);

  const handleTabChange = useCallback((tab: number) => {
    if (tab === activeTab) return;
    prevTabRef.current = activeTab;
    setActiveTab(tab);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [activeTab]);

  // ── Data state ───────────────────────────────────────────────────────────
  const [bookings,      setBookings]      = useState<ConfirmedBooking[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<MatchDocument[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isRefreshing,  setIsRefreshing]  = useState(false);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [selectedBookingForMatch, setSelectedBookingForMatch] =
    useState<ConfirmedBooking | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // ── Derived data ─────────────────────────────────────────────────────────

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

  // ── Tab 0: Rezervasyonlarım (own bookings + hosted match listings) ────────
  const reservationsTabItems = useMemo((): ActivityItem[] =>
    bookings.map((b) => ({
      kind:    'booking',
      id:      `booking-${b.id}`,
      booking: b,
      match:   hostedMatchByBookingId.get(b.id) ?? null,
    })),
  [bookings, hostedMatchByBookingId]);

  // ── Tab 1: Katıldıklarım (joined as participant, not host) ───────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
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

  // Direction for slide-in animation
  const listEntering = activeTab > prevTabRef.current
    ? FadeInRight.duration(320).easing(Easing.out(Easing.cubic))
    : FadeInLeft.duration(320).easing(Easing.out(Easing.cubic));

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
      {/* ── Static header — never re-mounts ────────────────────────────── */}
      <View style={S.staticHeader}>
        <Text style={S.header}>Etkinliklerim</Text>
        <SegmentedControl
          activeIndex={activeTab}
          onChange={handleTabChange}
          counts={[reservationsTabItems.length, joinedTabItems.length]}
        />
      </View>

      {/* ── Animated list — re-mounts on tab switch to trigger enter anim ── */}
      <Animated.View
        key={`tab-${activeTab}`}
        entering={listEntering}
        style={S.listWrapper}
      >
        <FlatList<ActivityItem>
          data={activeItems}
          keyExtractor={(item) => item.id}
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

      {/* ── Modals ────────────────────────────────────────────────────────── */}
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
