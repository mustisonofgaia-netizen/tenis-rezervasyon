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
  View,
} from 'react-native';

import { FACILITY_NAME, TEMP_USER_ID } from '../config/app';
import { cancelBooking, subscribeToUserBookings } from '../services/bookingService';
import type { ConfirmedBooking } from '../types/booking';

const SWIPE_THRESHOLD = 80;   // drag distance that triggers snap-open
const SNAP_OPEN = 100;         // resting translateX (negative) when action is revealed
const SLIDE_EXIT = -400;       // translateX that drives card fully off-screen before delete
const DELETE_ACTION_WIDTH = SNAP_OPEN;
const SPRING_CONFIG = { mass: 0.2, damping: 15, stiffness: 120 } as const;

function formatBookingDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isWithin24Hours(date: string, slotTime: string): boolean {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = slotTime.split(':').map(Number);
  const bookingStart = new Date(year, month - 1, day, hour, minute);
  return bookingStart.getTime() - Date.now() < 24 * 60 * 60 * 1000;
}

type SwipeableBookingCardProps = {
  booking: ConfirmedBooking;
};

function SwipeableBookingCard({ booking }: SwipeableBookingCardProps) {
  const translateX = useSharedValue(0);

  // Step 3: called on JS thread after slide-exit animation finishes
  const doCancel = useCallback(() => {
    cancelBooking(booking.date, booking.slotTime, TEMP_USER_ID).catch(() => {
      translateX.value = withSpring(0, SPRING_CONFIG);
      Alert.alert('Hata', 'İptal işlemi başarısız oldu. Lütfen tekrar deneyin.');
    });
    // On success: onSnapshot fires → FadeOut exits the row automatically
  }, [booking.date, booking.slotTime, translateX]);

  // Step 2: called on JS thread after card snaps open to -SNAP_OPEN
  const handleCancelAttempt = useCallback(() => {
    // 24-hour business rule: block with revert
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
          onPress: () => {
            translateX.value = withSpring(0, SPRING_CONFIG);
          },
        },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: () => {
            // Slide card fully off-screen, then commit the Firestore delete
            translateX.value = withTiming(
              SLIDE_EXIT,
              { duration: 280 },
              (finished) => {
                'worklet';
                if (finished) {
                  runOnJS(doCancel)();
                }
              },
            );
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
          // Rubber-band resistance once the finger drags past the snap-open point
          if (raw < -SNAP_OPEN) {
            translateX.value = -SNAP_OPEN + (raw + SNAP_OPEN) * 0.15;
          } else {
            translateX.value = raw;
          }
        })
        .onEnd(() => {
          if (translateX.value < -SWIPE_THRESHOLD) {
            // Step 1: snap open to reveal the action, then prompt on JS thread
            translateX.value = withSpring(-SNAP_OPEN, SPRING_CONFIG);
            runOnJS(handleCancelAttempt)();
          } else {
            translateX.value = withSpring(0, SPRING_CONFIG);
          }
        }),
    [handleCancelAttempt, translateX],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(translateX.value) / SNAP_OPEN);
    return {
      opacity: progress,
      transform: [{ scale: 0.75 + progress * 0.25 }],
    };
  });

  return (
    <Animated.View exiting={FadeOut.duration(280)} style={styles.swipeRow}>
      {/* Red action panel — sits behind the card, revealed on left swipe */}
      <View style={styles.deleteAction}>
        <Animated.View style={[styles.deleteActionContent, actionStyle]}>
          <Text style={styles.deleteActionIcon}>🗑️</Text>
          <Text style={styles.deleteActionLabel}>İptal Et</Text>
        </Animated.View>
      </View>

      {/* Sliding card foreground */}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.cardHeader}>
            <Text style={styles.facilityName}>{FACILITY_NAME}</Text>
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
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export function MyBookingsScreen() {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToUserBookings(TEMP_USER_ID, (nextBookings) => {
      setBookings(nextBookings);
      setIsLoading(false);
      setIsRefreshing(false);
    });

    return unsubscribe;
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 700);
  }, []);

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
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          bookings.length === 0 && styles.listContentEmpty,
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
          <Text style={styles.header}>Rezervasyonlarım</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Henüz rezervasyon yok</Text>
            <Text style={styles.emptyText}>
              Onaylanan kort rezervasyonlarınız burada görünecek.
            </Text>
          </View>
        }
        renderItem={({ item }) => <SwipeableBookingCard booking={item} />}
      />
    </SafeAreaView>
  );
}

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
    paddingBottom: 32,
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

  // — Swipe row —
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
  deleteActionIcon: {
    fontSize: 22,
  },
  deleteActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },

  // — Card —
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
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.3,
  },
  cardBody: {
    gap: 12,
  },
  infoBlock: {
    gap: 4,
  },
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

  // — Empty state —
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
