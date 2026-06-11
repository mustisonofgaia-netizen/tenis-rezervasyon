import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeOut,
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
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { COURTS, getCourtById } from '../config/courts';
import { cancelBooking, subscribeToUserBookings } from '../services/bookingService';
import { subscribeToMyJoinedMatches } from '../services/matchService';
import type { ConfirmedBooking } from '../types/booking';
import type { MatchDocument } from '../types/match';
import { MatchDetailsModal } from '../components/MatchDetailsModal';
import type { MatchBookingDetails } from '../components/MatchDetailsModal';
import { PublishMatchModal } from '../components/PublishMatchModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD   = 80;
const SNAP_OPEN         = 100;
const SLIDE_EXIT        = -400;
const DELETE_ACTION_WIDTH = SNAP_OPEN;
const SPRING_CONFIG     = { mass: 0.2, damping: 15, stiffness: 120 } as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBookingDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isWithin24Hours(date: string, slotTime: string): boolean {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute]     = slotTime.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime() - Date.now() <
    24 * 60 * 60 * 1000;
}

function resolveCourtName(courtId: string): string {
  return COURTS.find((c) => c.id === courtId)?.name ?? courtId;
}

// ─── Feed item union type ─────────────────────────────────────────────────────

type ActivityItem =
  | { kind: 'booking';     id: string; booking: ConfirmedBooking; match: MatchDocument | null }
  | { kind: 'joinedMatch'; id: string; match: MatchDocument };

// ─── Swipeable booking card ───────────────────────────────────────────────────

type SwipeableBookingCardProps = {
  booking: ConfirmedBooking;
  onFindPlayers: (booking: ConfirmedBooking) => void;
  onViewMatch: (match: MatchDocument) => void;
  activeMatch: MatchDocument | null;
};

function SwipeableBookingCard({
  booking,
  onFindPlayers,
  onViewMatch,
  activeMatch,
}: SwipeableBookingCardProps) {
  const { uid }    = useAuth();
  const translateX = useSharedValue(0);

  const doCancel = useCallback(() => {
    cancelBooking(booking.date, booking.slotTime, uid, booking.courtId).catch(() => {
      translateX.value = withSpring(0, SPRING_CONFIG);
      Alert.alert('Hata', 'İptal işlemi başarısız oldu. Lütfen tekrar deneyin.');
    });
  }, [booking.courtId, booking.date, booking.slotTime, translateX, uid]);

  const handleCancelAttempt = useCallback(() => {
    if (isWithin24Hours(booking.date, booking.slotTime)) {
      translateX.value = withSpring(0, SPRING_CONFIG);
      Alert.alert(
        'İptal Süresi Geçti',
        'Maç saatine 24 saatten az kaldığı için bu rezervasyon iptal edilemez.',
      );
      return;
    }
    Alert.alert(
      'Rezervasyon İptali',
      'Bu kort rezervasyonunu iptal etmek istediğinize emin misiniz? Ücret iade süreciniz başlatılacaktır.',
      [
        {
          text: 'Vazgeç / İptal',
          style: 'cancel',
          onPress: () => { translateX.value = withSpring(0, SPRING_CONFIG); },
        },
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
          translateX.value =
            raw < -SNAP_OPEN ? -SNAP_OPEN + (raw + SNAP_OPEN) * 0.15 : raw;
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
    <Animated.View exiting={FadeOut.duration(280)} style={styles.swipeRow}>
      {/* Red delete panel */}
      <View style={styles.deleteAction}>
        <Animated.View style={[styles.deleteActionContent, actionStyle]}>
          <Text style={styles.deleteActionIcon}>🗑️</Text>
          <Text style={styles.deleteActionLabel}>İptal Et</Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.cardHeader}>
            <Text style={styles.facilityName}>{getCourtById(booking.courtId).name}</Text>
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

          {/* ── Find players / active-listing badge ── */}
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

// ─── Joined-match card (non-host, non-swipeable) ──────────────────────────────

type JoinedMatchCardProps = {
  match: MatchDocument;
  onViewDetails: () => void;
};

function JoinedMatchCard({ match, onViewDetails }: JoinedMatchCardProps) {
  const courtName = resolveCourtName(match.courtId);
  const isFull    = match.status === 'FULL';

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onViewDetails}
      style={styles.joinedCard}
    >
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
            🎾  Katılımcı · {match.joinedPlayers.length}/{match.requiredPlayers} Oyuncu
          </Text>
          <Text style={styles.viewDetailsHint}>Detaylar →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MyBookingsScreen() {
  const { uid } = useAuth();

  const [bookings, setBookings]   = useState<ConfirmedBooking[]>([]);
  const [joinedMatches, setJoinedMatches] = useState<MatchDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Publish-match modal
  const [selectedBookingForMatch, setSelectedBookingForMatch] =
    useState<ConfirmedBooking | null>(null);

  // Match-details modal — store just the ID; derive match reactively so kicks
  // auto-update the modal without any extra plumbing.
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // ── Derived data ─────────────────────────────────────────────────────────

  // Map hosted matches by bookingId for spam-guard
  const hostedMatchByBookingId = useMemo(
    () => new Map(joinedMatches.filter((m) => m.hostId === uid).map((m) => [m.bookingId, m])),
    [joinedMatches, uid],
  );

  // Reactive selected match — stays fresh after kicks
  const selectedMatch = useMemo(
    () => (selectedMatchId ? (joinedMatches.find((m) => m.id === selectedMatchId) ?? null) : null),
    [joinedMatches, selectedMatchId],
  );

  // Selected match booking details for the modal
  const selectedMatchBookingDetails = useMemo((): MatchBookingDetails | null => {
    if (!selectedMatch) return null;
    return {
      courtName: resolveCourtName(selectedMatch.courtId),
      date:      selectedMatch.date,
      slotTime:  selectedMatch.slotTime,
    };
  }, [selectedMatch]);

  // Unified activity feed: owned bookings + joined (non-hosted) matches
  const activities = useMemo((): ActivityItem[] => {
    const bookingItems: ActivityItem[] = bookings.map((b) => ({
      kind:    'booking',
      id:      `booking-${b.id}`,
      booking: b,
      match:   hostedMatchByBookingId.get(b.id) ?? null,
    }));

    const joinedItems: ActivityItem[] = joinedMatches
      .filter((m) => m.hostId !== uid)
      .map((m) => ({
        kind:  'joinedMatch',
        id:    `match-${m.id}`,
        match: m,
      }));

    return [...bookingItems, ...joinedItems];
  }, [bookings, hostedMatchByBookingId, joinedMatches, uid]);

  // ── Subscriptions ─────────────────────────────────────────────────────────

  useEffect(() => {
    return subscribeToUserBookings(uid, (next) => {
      setBookings(next);
      setIsLoading(false);
      setIsRefreshing(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single subscription covers both hosted and joined matches
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList<ActivityItem>
        data={activities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          activities.length === 0 && styles.listContentEmpty,
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
        ListHeaderComponent={
          <Text style={styles.header}>Etkinliklerim</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Henüz etkinlik yok</Text>
            <Text style={styles.emptyText}>
              Kort rezervasyonu yap veya Lobi'den bir maça katıl.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'booking') {
            return (
              <SwipeableBookingCard
                booking={item.booking}
                onFindPlayers={setSelectedBookingForMatch}
                onViewMatch={openMatchDetails}
                activeMatch={item.match}
              />
            );
          }
          return (
            <JoinedMatchCard
              match={item.match}
              onViewDetails={() => openMatchDetails(item.match)}
            />
          );
        }}
      />

      {/* ── Publish-match modal ────────────────────── */}
      {selectedBookingForMatch && (
        <PublishMatchModal
          isVisible
          booking={selectedBookingForMatch}
          onClose={() => setSelectedBookingForMatch(null)}
        />
      )}

      {/* ── Match-details modal ────────────────────── */}
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
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 20,
  },

  // ── Swipe row ─────────────────────────────────────────────────────────────
  swipeRow: {
    marginBottom: 14,
  },
  deleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DELETE_ACTION_WIDTH,
    backgroundColor: '#EF4444',
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionContent: {
    alignItems: 'center',
    gap: 5,
  },
  deleteActionIcon: { fontSize: 22 },
  deleteActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },

  // ── Booking card (swipeable) ──────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },

  // ── Joined-match card (non-swipeable) ─────────────────────────────────────
  joinedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 14,
  },

  // ── Shared card anatomy ───────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  facilityName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  badge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeFull: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.3,
  },
  badgeTextFull: {
    color: '#92400E',
  },
  cardBody: { gap: 12 },
  infoBlock: { gap: 4 },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  // ── Card footer (CTA row) ─────────────────────────────────────────────────
  cardFooter: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  findPlayersButton: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  findPlayersText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  activeMatchBadge: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  activeMatchText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    letterSpacing: 0.1,
  },
  joinedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  joinedBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  viewDetailsHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#93C5FD',
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
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
  },
});
