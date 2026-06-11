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

// Activity type accent colors
const ACCENT_PURE   = '#D1D5DB';  // gray  — plain reservation
const ACCENT_HOSTED = '#22C55E';  // green — hosted match listing
const ACCENT_JOINED = '#3B82F6';  // blue  — joined as participant

// Segmented control
const SEG_NEAR_BLACK = '#0F172A';
const SEG_LIME       = '#DEFF9A';

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

// ─── Activity type badge ──────────────────────────────────────────────────────

type ActivityKind = 'pure' | 'hosted' | 'joined';

function TypeBadge({ kind }: { kind: ActivityKind }) {
  const configs: Record<ActivityKind, { label: string; bg: string; text: string; border: string }> = {
    pure:   { label: '📋 Sadece Rezervasyon',        bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' },
    hosted: { label: '👑 Sizin İlanınız (Kurucu)',   bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
    joined: { label: '🎾 Katılımcı',                 bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  };
  const c = configs[kind];
  return (
    <View style={[styles.typeBadge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.typeBadgeText, { color: c.text }]}>{c.label}</Text>
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
  const { uid }    = useAuth();
  const translateX = useSharedValue(0);

  const accentColor  = activeMatch ? ACCENT_HOSTED : ACCENT_PURE;
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
      style={styles.swipeRow}
    >
      {/* Red delete panel */}
      <View style={styles.deleteAction}>
        <Animated.View style={[styles.deleteActionContent, actionStyle]}>
          <Text style={styles.deleteActionIcon}>🗑️</Text>
          <Text style={styles.deleteActionLabel}>İptal Et</Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, { borderLeftColor: accentColor }, cardStyle]}>
          <TypeBadge kind={activityKind} />

          <View style={styles.cardHeader}>
            <Text style={styles.facilityName}>{resolveCourtName(booking.courtId)}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Onaylandı</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Tarih</Text>
              <Text style={styles.infoValue}>{formatBookingDate(booking.date)}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Saat</Text>
              <Text style={styles.infoValue}>{booking.slotTime}</Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            {activeMatch ? (
              <TouchableOpacity
                style={styles.activeMatchBadge}
                activeOpacity={0.75}
                onPress={() => onViewMatch(activeMatch)}
              >
                <Text style={styles.activeMatchText}>
                  {'📢  İlan Yayında · '}
                  {activeMatch.joinedPlayers.length}/{activeMatch.requiredPlayers}
                  {' Oyuncu  →'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.findPlayersButton}
                activeOpacity={0.75}
                onPress={() => onFindPlayers(booking)}
              >
                <Text style={styles.findPlayersText}>🎾  Oyuncu Ara</Text>
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
  const courtName = resolveCourtName(match.courtId);
  const isFull    = match.status === 'FULL';

  return (
    <Animated.View
      entering={FadeInDown.delay(entryDelay).duration(400).easing(Easing.out(Easing.cubic))}
      style={styles.joinedCardWrapper}
    >
      <TouchableOpacity activeOpacity={0.78} onPress={onViewDetails} style={styles.joinedCard}>
        <TypeBadge kind="joined" />

        <View style={styles.cardHeader}>
          <Text style={styles.facilityName}>{courtName}</Text>
          <View style={[styles.badge, isFull && styles.badgeFull]}>
            <Text style={[styles.badgeText, isFull && styles.badgeTextFull]}>
              {isFull ? 'Dolu' : 'Açık'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Tarih</Text>
            <Text style={styles.infoValue}>{formatBookingDate(match.date)}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Saat</Text>
            <Text style={styles.infoValue}>{match.slotTime}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.joinedBadgeRow}>
            <Text style={styles.joinedBadgeText}>
              {match.joinedPlayers.length}/{match.requiredPlayers} Oyuncu
            </Text>
            <Text style={styles.viewDetailsHint}>Detayları Gör →</Text>
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
  return (
    <View style={styles.segWrapper}>
      {TABS.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <TouchableOpacity
            key={label}
            onPress={() => onChange(i)}
            style={[styles.segTab, isActive && styles.segTabActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.segTabText, isActive && styles.segTabTextActive]}>
              {label}
            </Text>
            {counts[i] > 0 && (
              <View style={[styles.segCount, isActive && styles.segCountActive]}>
                <Text style={[styles.segCountText, isActive && styles.segCountTextActive]}>
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#22C55E" />
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
    <SafeAreaView style={styles.safeArea}>
      {/* ── Static header — never re-mounts ────────────────────────────── */}
      <View style={styles.staticHeader}>
        <Text style={styles.header}>Etkinliklerim</Text>
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
        style={styles.listWrapper}
      >
        <FlatList<ActivityItem>
          data={activeItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            activeItems.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#22C55E"
              colors={['#22C55E']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {emptyMessages[activeTab]?.title}
              </Text>
              <Text style={styles.emptyText}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:        { flex: 1, backgroundColor: '#F9FAFB' },
  loaderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listWrapper:     { flex: 1 },

  // ── Static header + segmented control ────────────────────────────────────
  staticHeader: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 4,
    backgroundColor: '#F9FAFB',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  // ── Segmented control ─────────────────────────────────────────────────────
  segWrapper: {
    flexDirection: 'row',
    backgroundColor: SEG_NEAR_BLACK,
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
  segTabActive: {
    backgroundColor: SEG_LIME,
  },
  segTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  segTabTextActive: {
    color: SEG_NEAR_BLACK,
  },
  segCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  segCountActive: {
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
  },
  segCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
  },
  segCountTextActive: {
    color: SEG_NEAR_BLACK,
  },

  // ── List ─────────────────────────────────────────────────────────────────
  listContent:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  listContentEmpty: { flexGrow: 1 },

  // ── Activity type badge ───────────────────────────────────────────────────
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

  // ── Swipe row ─────────────────────────────────────────────────────────────
  swipeRow:    { marginBottom: 14 },
  deleteAction: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: DELETE_ACTION_WIDTH,
    backgroundColor: '#EF4444',
    borderTopRightRadius: 18, borderBottomRightRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteActionContent: { alignItems: 'center', gap: 5 },
  deleteActionIcon:    { fontSize: 22 },
  deleteActionLabel:   { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 },

  // ── Base card (booking, swipeable) ────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  // ── Joined-match card ─────────────────────────────────────────────────────
  joinedCardWrapper: { marginBottom: 14 },
  joinedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderLeftWidth: 4,
    borderLeftColor: ACCENT_JOINED,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  // ── Shared card anatomy ───────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16, gap: 12,
  },
  facilityName: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827', lineHeight: 22 },
  badge: {
    backgroundColor: '#DCFCE7', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  badgeFull:     { backgroundColor: '#FEF3C7' },
  badgeText:     { fontSize: 12, fontWeight: '700', color: '#15803D', letterSpacing: 0.3 },
  badgeTextFull: { color: '#92400E' },
  cardBody:      { gap: 12 },
  infoBlock:     { gap: 4 },
  infoLabel:     { fontSize: 12, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue:     { fontSize: 15, fontWeight: '600', color: '#374151' },

  // ── Card footer (CTA row) ─────────────────────────────────────────────────
  cardFooter: {
    marginTop: 16, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
  },
  findPlayersButton: {
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  findPlayersText:  { fontSize: 13, fontWeight: '700', color: '#15803D', letterSpacing: 0.2 },
  activeMatchBadge: {
    backgroundColor: '#FFFBEB', borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#FDE68A',
  },
  activeMatchText:  { fontSize: 13, fontWeight: '700', color: '#92400E', letterSpacing: 0.1 },
  joinedBadgeRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  joinedBadgeText:  { fontSize: 13, fontWeight: '600', color: ACCENT_JOINED },
  viewDetailsHint:  { fontSize: 12, fontWeight: '600', color: '#93C5FD' },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptyText:  { fontSize: 14, lineHeight: 22, color: '#6B7280', textAlign: 'center' },
});
