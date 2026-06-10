import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FACILITY_NAME, TEMP_USER_ID } from '../config/app';
import { subscribeToUserBookings } from '../services/bookingService';
import type { ConfirmedBooking } from '../types/booking';

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

type BookingCardProps = {
  booking: ConfirmedBooking;
};

function BookingCard({ booking }: BookingCardProps) {
  return (
    <View style={styles.card}>
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
    </View>
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
        renderItem={({ item }) => <BookingCard booking={item} />}
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
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
