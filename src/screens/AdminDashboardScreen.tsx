import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { HorizontalDayPicker } from '../components/HorizontalDayPicker';
import { FACILITY_NAME } from '../config/app';
import {
  adminBlockSlot,
  adminCancelSlot,
  adminUnblockSlot,
  subscribeToAdminSlots,
} from '../services/bookingService';
import type { AdminSlotInfo, SlotStatus } from '../types/booking';

const COURT_RATE_TL = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayKey(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type MetricCardProps = {
  icon: string;
  label: string;
  value: string;
  accent: string;
};

function MetricCard({ icon, label, value, accent }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { borderTopColor: accent }]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

type StatusBadgeProps = { status: SlotStatus };

const STATUS_CONFIG: Record<SlotStatus, { label: string; bg: string; text: string }> = {
  FREE:      { label: 'Müsait',  bg: '#DCFCE7', text: '#15803D' },
  LOCKED:    { label: 'Kilitli', bg: '#FEF3C7', text: '#92400E' },
  CONFIRMED: { label: 'Dolu',    bg: '#DBEAFE', text: '#1E40AF' },
  BLOCKED:   { label: 'Bloke',   bg: '#FEE2E2', text: '#991B1B' },
};

function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

type AdminSlotRowProps = {
  slot: AdminSlotInfo;
  date: string;
};

function AdminSlotRow({ slot, date }: AdminSlotRowProps) {
  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<boolean>, errorMsg: string) => {
      setIsBusy(true);
      const ok = await action().catch(() => false);
      if (!ok) {
        Alert.alert('İşlem Başarısız', errorMsg);
      }
      setIsBusy(false);
    },
    [],
  );

  const handleBlock = useCallback(() => {
    run(
      () => adminBlockSlot(date, slot.time),
      'Slot bloke edilemedi. Lütfen tekrar deneyin.',
    );
  }, [date, run, slot.time]);

  const handleUnblock = useCallback(() => {
    run(
      () => adminUnblockSlot(date, slot.time),
      'Slot açılamadı. Lütfen tekrar deneyin.',
    );
  }, [date, run, slot.time]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Rezervasyonu İptal Et',
      `${slot.time} saatindeki rezervasyonu iptal etmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: () => {
            run(
              () => adminCancelSlot(date, slot.time),
              'İptal işlemi başarısız oldu.',
            );
          },
        },
      ],
    );
  }, [date, run, slot.time]);

  return (
    <View style={styles.slotRow}>
      {/* Left: time + status */}
      <View style={styles.slotLeft}>
        <Text style={styles.slotTime}>{slot.time}</Text>
        <StatusBadge status={slot.status} />
      </View>

      {/* Center: user info */}
      <View style={styles.slotCenter}>
        {slot.userId ? (
          <Text style={styles.slotUserId} numberOfLines={1}>
            {slot.userId}
          </Text>
        ) : null}
        {slot.paymentId ? (
          <Text style={styles.slotPaymentId} numberOfLines={1}>
            #{slot.paymentId}
          </Text>
        ) : null}
      </View>

      {/* Right: action button */}
      <View style={styles.slotRight}>
        {isBusy ? (
          <ActivityIndicator size="small" color="#6B7280" />
        ) : (
          <>
            {slot.status === 'FREE' && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleBlock}
                style={[styles.actionBtn, styles.btnBlock]}
              >
                <Text style={styles.actionBtnText}>Bloke Et</Text>
              </TouchableOpacity>
            )}

            {slot.status === 'BLOCKED' && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleUnblock}
                style={[styles.actionBtn, styles.btnUnblock]}
              >
                <Text style={styles.actionBtnText}>Aç</Text>
              </TouchableOpacity>
            )}

            {(slot.status === 'CONFIRMED' || slot.status === 'LOCKED') && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleCancel}
                style={[styles.actionBtn, styles.btnCancel]}
              >
                <Text style={styles.actionBtnText}>İptal Et</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function AdminDashboardScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());
  const [slots, setSlots] = useState<AdminSlotInfo[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  useEffect(() => {
    setIsLoadingSlots(true);
    const unsubscribe = subscribeToAdminSlots(selectedDate, (nextSlots) => {
      setSlots(nextSlots);
      setIsLoadingSlots(false);
    });
    return unsubscribe;
  }, [selectedDate]);

  const metrics = useMemo(() => {
    const total = slots.length;
    const confirmed = slots.filter((s) => s.status === 'CONFIRMED').length;
    const blocked = slots.filter((s) => s.status === 'BLOCKED').length;
    const occupancy = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    const revenue = confirmed * COURT_RATE_TL;
    return { occupancy, revenue, blocked };
  }, [slots]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Kontrol Paneli</Text>
          <Text style={styles.pageSubtitle}>{FACILITY_NAME}</Text>
        </View>

        {/* ── Date picker ────────────────────────────── */}
        <Text style={styles.sectionLabel}>Tarih</Text>
        <HorizontalDayPicker
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* ── Metrics ────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Özet
        </Text>

        {isLoadingSlots ? (
          <View style={styles.metricsLoading}>
            <ActivityIndicator color="#22C55E" />
          </View>
        ) : (
          <View style={styles.metricsRow}>
            <MetricCard
              icon="📊"
              label="Doluluk Oranı"
              value={`%${metrics.occupancy}`}
              accent="#22C55E"
            />
            <MetricCard
              icon="💰"
              label="Bugünkü Ciro"
              value={`${metrics.revenue.toLocaleString('tr-TR')} TL`}
              accent="#3B82F6"
            />
            <MetricCard
              icon="🔒"
              label="Bloke Saatler"
              value={String(metrics.blocked)}
              accent="#F59E0B"
            />
          </View>
        )}

        {/* ── Schedule ───────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Program
        </Text>

        {isLoadingSlots ? (
          <View style={styles.scheduleLoading}>
            <ActivityIndicator size="large" color="#22C55E" />
          </View>
        ) : (
          <View style={styles.scheduleCard}>
            {slots.map((slot, index) => (
              <View key={slot.time}>
                {index > 0 && <View style={styles.divider} />}
                <AdminSlotRow slot={slot} date={selectedDate} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Header
  pageHeader: {
    marginBottom: 28,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 28,
  },

  // Metrics
  metricsLoading: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
  },
  metricIcon: {
    fontSize: 20,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Schedule
  scheduleLoading: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },

  // Slot rows
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  slotLeft: {
    width: 90,
    gap: 6,
  },
  slotTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.2,
  },
  slotCenter: {
    flex: 1,
    gap: 3,
  },
  slotUserId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  slotPaymentId: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  slotRight: {
    width: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 34,
  },

  // Status badge
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Action buttons
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  btnBlock: {
    backgroundColor: '#F59E0B',
  },
  btnUnblock: {
    backgroundColor: '#22C55E',
  },
  btnCancel: {
    backgroundColor: '#EF4444',
  },
});
