import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtPicker } from '../components/CourtPicker';
import { HorizontalDayPicker } from '../components/HorizontalDayPicker';
import { FACILITY_NAME } from '../config/app';
import { COURT_IDS, DEFAULT_COURT_ID, getCourtById } from '../config/courts';
import {
  adminBlockSlot,
  adminCancelSlot,
  adminUnblockSlot,
  adminUpdateCourtPrice,
  subscribeToAdminSlots,
  subscribeToAllCourtsAdminSlots,
  subscribeToCourtPrice,
} from '../services/bookingService';
import type { AdminSlotInfo, CourtId, SlotStatus } from '../types/booking';

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
      <Text style={[styles.metricValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
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
  courtId: CourtId;
};

function AdminSlotRow({ slot, date, courtId }: AdminSlotRowProps) {
  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<boolean>, errorMsg: string) => {
      setIsBusy(true);
      const ok = await action().catch(() => false);
      if (!ok) Alert.alert('İşlem Başarısız', errorMsg);
      setIsBusy(false);
    },
    [],
  );

  const handleBlock = useCallback(() => {
    run(
      () => adminBlockSlot(date, slot.time, courtId),
      'Slot bloke edilemedi. Lütfen tekrar deneyin.',
    );
  }, [courtId, date, run, slot.time]);

  const handleUnblock = useCallback(() => {
    run(
      () => adminUnblockSlot(date, slot.time, courtId),
      'Slot açılamadı. Lütfen tekrar deneyin.',
    );
  }, [courtId, date, run, slot.time]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Rezervasyonu İptal Et',
      `${slot.time} saatindeki rezervasyonu iptal etmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, İptal Et',
          style: 'destructive',
          onPress: () =>
            run(
              () => adminCancelSlot(date, slot.time, courtId),
              'İptal işlemi başarısız oldu.',
            ),
        },
      ],
    );
  }, [courtId, date, run, slot.time]);

  return (
    <View style={styles.slotRow}>
      <View style={styles.slotLeft}>
        <Text style={styles.slotTime}>{slot.time}</Text>
        <StatusBadge status={slot.status} />
      </View>

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
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());
  const [selectedCourtId, setSelectedCourtId] = useState<CourtId>(DEFAULT_COURT_ID);

  const [courtSlots, setCourtSlots] = useState<AdminSlotInfo[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  const [allCourtsSlots, setAllCourtsSlots] = useState<Record<CourtId, AdminSlotInfo[]>>({
    court_1: [],
    court_2: [],
    court_3: [],
  });

  const [allPrices, setAllPrices] = useState<Record<CourtId, number>>({
    court_1: getCourtById('court_1').basePrice,
    court_2: getCourtById('court_2').basePrice,
    court_3: getCourtById('court_3').basePrice,
  });

  const [courtPrice, setCourtPrice] = useState<number>(
    getCourtById(DEFAULT_COURT_ID).basePrice,
  );
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  useEffect(() => {
    setIsLoadingSlots(true);
    return subscribeToAdminSlots(selectedDate, selectedCourtId, (nextSlots) => {
      setCourtSlots(nextSlots);
      setIsLoadingSlots(false);
    });
  }, [selectedDate, selectedCourtId]);

  useEffect(() => {
    return subscribeToAllCourtsAdminSlots(selectedDate, setAllCourtsSlots);
  }, [selectedDate]);

  useEffect(() => {
    setCourtPrice(getCourtById(selectedCourtId).basePrice);
    setEditingPrice(null);
    return subscribeToCourtPrice(selectedCourtId, (price) => {
      setCourtPrice(price);
      setAllPrices((prev) => ({ ...prev, [selectedCourtId]: price }));
    });
  }, [selectedCourtId]);

  useEffect(() => {
    const unsubscribers = COURT_IDS.map((id) =>
      subscribeToCourtPrice(id, (price) =>
        setAllPrices((prev) => ({ ...prev, [id]: price })),
      ),
    );
    return () => unsubscribers.forEach((u) => u());
  }, []);

  // ─── Aggregate metrics ───────────────────────────────────────────────────────

  const aggregateMetrics = useMemo(() => {
    let totalSlots = 0;
    let confirmedSlots = 0;
    let blockedSlots = 0;
    let revenue = 0;

    for (const courtId of COURT_IDS) {
      const slots = allCourtsSlots[courtId] ?? [];
      const confirmed = slots.filter((s) => s.status === 'CONFIRMED').length;
      const blocked = slots.filter((s) => s.status === 'BLOCKED').length;
      totalSlots += slots.length;
      confirmedSlots += confirmed;
      blockedSlots += blocked;
      revenue += confirmed * (allPrices[courtId] ?? getCourtById(courtId).basePrice);
    }

    return {
      occupancy: totalSlots > 0 ? Math.round((confirmedSlots / totalSlots) * 100) : 0,
      revenue,
      blockedSlots,
    };
  }, [allCourtsSlots, allPrices]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectCourt = useCallback((courtId: CourtId) => {
    setSelectedCourtId(courtId);
  }, []);

  const handleSavePrice = useCallback(async () => {
    const parsed = parseInt(editingPrice ?? '', 10);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Geçersiz Fiyat', 'Lütfen geçerli bir sayı girin.');
      return;
    }
    setIsSavingPrice(true);
    const ok = await adminUpdateCourtPrice(selectedCourtId, parsed);
    setIsSavingPrice(false);
    if (!ok) Alert.alert('Hata', 'Fiyat güncellenemedi. Tekrar deneyin.');
    else setEditingPrice(null);
  }, [editingPrice, selectedCourtId]);

  const selectedCourt = getCourtById(selectedCourtId);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    /*
      Layout:
        View (flex: 1, paddingTop = safeArea top)
          └── ScrollView (single, owns all vertical scroll)
                ├── Header
                ├── Tarih section
                ├── Günlük Özet (aggregate metrics)
                ├── Kort Seçimi (CourtPicker)
                ├── Price editor card
                └── Günlük Program (slot schedule)
    */
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Header ──────────────────────────────── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Kontrol Paneli</Text>
          <Text style={styles.pageSubtitle}>{FACILITY_NAME}</Text>
        </View>

        {/* ── 2. Tarih ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>Tarih</Text>
        <HorizontalDayPicker
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* ── 3. Günlük Özet — aggregate across all courts */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Özet — Tüm Kortlar
        </Text>
        <View style={styles.metricsRow}>
          <MetricCard
            icon="📊"
            label="Doluluk Oranı"
            value={`%${aggregateMetrics.occupancy}`}
            accent="#22C55E"
          />
          <MetricCard
            icon="💰"
            label="Bugünkü Ciro"
            value={`${aggregateMetrics.revenue.toLocaleString('tr-TR')} TL`}
            accent="#3B82F6"
          />
          <MetricCard
            icon="🔒"
            label="Bloke Saatler"
            value={String(aggregateMetrics.blockedSlots)}
            accent="#F59E0B"
          />
        </View>

        {/* ── 4. Kort Seçimi ─────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Kort Seçimi
        </Text>
        {/*
          Negative horizontal margin breaks CourtPicker out of the parent's
          paddingHorizontal so it can scroll edge-to-edge.
          CourtPicker's contentContainerStyle re-applies paddingHorizontal: 20.
        */}
        <View style={styles.courtPickerWrapper}>
          <CourtPicker
            selectedCourtId={selectedCourtId}
            onSelectCourt={handleSelectCourt}
            livePrices={allPrices}
          />
        </View>

        {/* ── 5. Price editor ────────────────────────── */}
        <View style={styles.priceEditorCard}>
          <View style={styles.priceEditorHeader}>
            <View>
              <Text style={styles.priceEditorCourtName}>{selectedCourt.name}</Text>
              <Text style={styles.priceEditorHint}>Mevcut Saat Ücreti</Text>
            </View>
          </View>

          {editingPrice !== null ? (
            <View style={styles.priceEditRow}>
              <TextInput
                value={editingPrice}
                onChangeText={setEditingPrice}
                keyboardType="number-pad"
                style={styles.priceInput}
                autoFocus
                selectTextOnFocus
                placeholder="Yeni fiyat (TL)"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSavePrice}
                disabled={isSavingPrice}
                style={styles.priceSaveBtn}
              >
                {isSavingPrice ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.priceSaveBtnText}>Kaydet</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEditingPrice(null)}
                style={styles.priceCancelBtn}
              >
                <Text style={styles.priceCancelBtnText}>İptal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.priceDisplayRow}>
              <Text style={styles.priceDisplay}>
                {courtPrice.toLocaleString('tr-TR')} TL
              </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setEditingPrice(String(courtPrice))}
                style={styles.priceEditBtn}
              >
                <Text style={styles.priceEditBtnText}>✏️ Düzenle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── 6. Günlük Program ──────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Program — {selectedCourt.name}
        </Text>

        {isLoadingSlots ? (
          <View style={styles.scheduleLoading}>
            <ActivityIndicator size="large" color="#22C55E" />
          </View>
        ) : (
          <View style={styles.scheduleCard}>
            {courtSlots.map((slot, index) => (
              <View key={slot.time}>
                {index > 0 && <View style={styles.divider} />}
                <AdminSlotRow
                  slot={slot}
                  date={selectedDate}
                  courtId={selectedCourtId}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HORIZONTAL_PAD = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PAD,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Header
  pageHeader: {
    marginBottom: 24,
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

  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 5,
  },
  metricIcon: {
    fontSize: 20,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // CourtPicker breakout
  courtPickerWrapper: {
    marginHorizontal: -HORIZONTAL_PAD,
  },

  // Price editor card
  priceEditorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
    gap: 10,
  },
  priceEditorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  priceEditorCourtName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  priceEditorHint: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  priceDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceDisplay: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  priceEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  priceEditBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  priceEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  priceSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    minWidth: 72,
    alignItems: 'center',
  },
  priceSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  priceCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  priceCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
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
