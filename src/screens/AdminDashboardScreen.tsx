import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
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
import { CLUBS, getClubById, getCourtById, getCourtsByClubId } from '../config/data';
import { useAuth } from '../context/AuthContext';
import {
  adminBlockSlot,
  adminCancelSlot,
  adminUnblockSlot,
  adminUpdateCourtPrice,
  subscribeToAdminSlots,
  subscribeToCourtPrice,
  subscribeToSelectedCourtsAdminSlots,
} from '../services/bookingService';
import { auth } from '../services/firebase';
import type { AdminSlotInfo, CourtId, SlotStatus } from '../types/booking';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Marketplace platform fee deducted from club gross revenue. */
const COMMISSION_RATE = 0.2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  subLabel?: string;
};

function MetricCard({ icon, label, value, accent, subLabel }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { borderTopColor: accent }]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text
        style={[styles.metricValue, { color: accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {subLabel ? <Text style={styles.metricSubLabel}>{subLabel}</Text> : null}
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
  const { role, managedClubId } = useAuth();

  // ── Club scope ─────────────────────────────────────────────────────────────
  // super_admin picks a club from a selector; club_admin is locked to their club.
  const [superAdminClubId, setSuperAdminClubId] = useState<string>(CLUBS[0]?.id ?? '');
  const scopedClubId  = role === 'club_admin' ? managedClubId : superAdminClubId;
  const scopedClub    = useMemo(() => getClubById(scopedClubId), [scopedClubId]);
  const scopedCourts  = useMemo(() => getCourtsByClubId(scopedClubId), [scopedClubId]);

  // Guard: club_admin without a configured club
  const isMisconfigured = role === 'club_admin' && !managedClubId;

  // ── Date & court selection ─────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState<string>(getTodayKey());
  const [selectedCourtId, setSelectedCourtId] = useState<CourtId>(
    (scopedCourts[0]?.id ?? 'court_1') as CourtId,
  );

  // Reset court to first of the new club whenever the scoped club changes
  useEffect(() => {
    const first = getCourtsByClubId(scopedClubId)[0];
    if (first) setSelectedCourtId(first.id as CourtId);
  }, [scopedClubId]);

  // ── Slot state ─────────────────────────────────────────────────────────────
  const [courtSlots, setCourtSlots]       = useState<AdminSlotInfo[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [allCourtsSlots, setAllCourtsSlots] = useState<Record<string, AdminSlotInfo[]>>({});

  // ── Price state ────────────────────────────────────────────────────────────
  const [allPrices, setAllPrices]     = useState<Record<string, number>>({});
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Derived — never stored in state to avoid stale reads
  const courtPrice = allPrices[selectedCourtId] ?? getCourtById(selectedCourtId).basePrice;

  // ── Subscriptions: detail slots (selected court) ──────────────────────────
  useEffect(() => {
    setIsLoadingSlots(true);
    return subscribeToAdminSlots(selectedDate, selectedCourtId, (nextSlots) => {
      setCourtSlots(nextSlots);
      setIsLoadingSlots(false);
    });
  }, [selectedDate, selectedCourtId]);

  // ── Subscriptions: aggregate slots (all scoped courts) ────────────────────
  useEffect(() => {
    const ids = getCourtsByClubId(scopedClubId).map((c) => c.id) as CourtId[];
    // Pre-populate with empty arrays so metrics don't flash on club change
    setAllCourtsSlots(Object.fromEntries(ids.map((id) => [id, []])));
    return subscribeToSelectedCourtsAdminSlots(selectedDate, ids, setAllCourtsSlots);
  }, [selectedDate, scopedClubId]);

  // ── Subscriptions: prices (all scoped courts) ─────────────────────────────
  useEffect(() => {
    const courts = getCourtsByClubId(scopedClubId);
    // Seed from static config immediately so editor shows a price right away
    setAllPrices(Object.fromEntries(courts.map((c) => [c.id, c.basePrice])));
    const unsubs = courts.map(({ id }) =>
      subscribeToCourtPrice(id as CourtId, (price) =>
        setAllPrices((prev) => ({ ...prev, [id]: price })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [scopedClubId]);

  // Reset price editor when navigating to a different court
  useEffect(() => {
    setEditingPrice(null);
  }, [selectedCourtId]);

  // ── Aggregate metrics (scoped to current club) ────────────────────────────
  const aggregateMetrics = useMemo(() => {
    const scopedIds = getCourtsByClubId(scopedClubId).map((c) => c.id);
    let totalSlots    = 0;
    let confirmedSlots = 0;
    let blockedSlots  = 0;
    let grossRevenue  = 0;

    for (const courtId of scopedIds) {
      const slots     = allCourtsSlots[courtId] ?? [];
      const confirmed = slots.filter((s) => s.status === 'CONFIRMED').length;
      const blocked   = slots.filter((s) => s.status === 'BLOCKED').length;
      totalSlots     += slots.length;
      confirmedSlots += confirmed;
      blockedSlots   += blocked;
      grossRevenue   += confirmed * (allPrices[courtId] ?? getCourtById(courtId).basePrice);
    }

    const commission = Math.round(grossRevenue * COMMISSION_RATE);
    const netPayout  = grossRevenue - commission;

    return {
      occupancy: totalSlots > 0 ? Math.round((confirmedSlots / totalSlots) * 100) : 0,
      grossRevenue,
      netPayout,
      commission,
      blockedSlots,
    };
  }, [allCourtsSlots, allPrices, scopedClubId]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectCourt = useCallback((id: CourtId) => setSelectedCourtId(id), []);

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

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Çıkış Yap',
      'Yönetici hesabından çıkmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: () => signOut(auth).catch(() => {}),
        },
      ],
    );
  }, []);

  const selectedCourt = getCourtById(selectedCourtId);

  // ── Guard: club_admin with no managedClubId ────────────────────────────────
  if (isMisconfigured) {
    return (
      <View style={[styles.container, styles.centeredGuard, { paddingTop: insets.top }]}>
        <Text style={styles.guardEmoji}>⚠️</Text>
        <Text style={styles.guardTitle}>Kulüp Atanmamış</Text>
        <Text style={styles.guardBody}>
          Hesabınıza henüz bir kulüp atanmamış.{'\n'}
          Lütfen platform yöneticinizle iletişime geçin.
        </Text>
        <TouchableOpacity
          style={styles.guardSignOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.guardSignOutText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 1. Header ──────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit>
              {scopedClub.name}
            </Text>
            <Text style={styles.pageSubtitle}>Yönetim Paneli</Text>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* ── 2. Club Selector (super_admin only) ────────────────── */}
        {role === 'super_admin' && (
          <>
            <Text style={styles.sectionLabel}>Kulüp Görünümü</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.clubSelectorRow}
            >
              {CLUBS.map((club) => {
                const isActive = club.id === scopedClubId;
                return (
                  <TouchableOpacity
                    key={club.id}
                    onPress={() => setSuperAdminClubId(club.id)}
                    style={[styles.clubPill, isActive && styles.clubPillActive]}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.clubPillText,
                        isActive && styles.clubPillTextActive,
                      ]}
                    >
                      {club.name}
                    </Text>
                    {isActive && (
                      <View style={styles.clubPillDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── 3. Tarih ───────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Tarih</Text>
        <HorizontalDayPicker
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* ── 4. Financial Summary (scoped to club) ──────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Günlük Özet — {scopedCourts.length} Kort
        </Text>

        <View style={styles.metricsGrid}>
          {/* Row 1 */}
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
              value={`${aggregateMetrics.grossRevenue.toLocaleString('tr-TR')} TL`}
              accent="#3B82F6"
            />
          </View>

          {/* Row 2 — Financial breakdown */}
          <View style={[styles.metricsRow, styles.metricsRowGap]}>
            <MetricCard
              icon="🏦"
              label="Net Hakediş"
              value={`${aggregateMetrics.netPayout.toLocaleString('tr-TR')} TL`}
              accent="#22C55E"
              subLabel="%80"
            />
            <MetricCard
              icon="📉"
              label="Platform Kesintisi"
              value={`${aggregateMetrics.commission.toLocaleString('tr-TR')} TL`}
              accent="#F59E0B"
              subLabel="%20"
            />
          </View>

          <Text style={styles.commissionHint}>
            %{Math.round(COMMISSION_RATE * 100)} platform komisyonu düşülmüş net hakediş tutarı. Bloke:&nbsp;
            <Text style={styles.commissionHintBold}>
              {aggregateMetrics.blockedSlots} saat
            </Text>
          </Text>
        </View>

        {/* ── 5. Court Selector (filtered to scoped club) ────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Kort Seçimi
        </Text>
        <View style={styles.courtPickerWrapper}>
          <CourtPicker
            selectedCourtId={selectedCourtId}
            onSelectCourt={handleSelectCourt}
            courts={scopedCourts}
            livePrices={allPrices}
          />
        </View>

        {/* ── 6. Price editor ────────────────────────────────────── */}
        <View style={styles.priceEditorCard}>
          <View style={styles.priceEditorHeader}>
            <View>
              <Text style={styles.priceEditorCourtName}>{selectedCourt.name}</Text>
              <Text style={styles.priceEditorHint}>Saatlik Ücret</Text>
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

        {/* ── 7. Daily Schedule ──────────────────────────────────── */}
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
    paddingBottom: 48,
  },

  // ── Guard state ──────────────────────────────────────────────────────────────
  centeredGuard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  guardEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  guardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  guardBody: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  guardSignOutBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  guardSignOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Club selector (super_admin) ───────────────────────────────────────────
  clubSelectorRow: {
    gap: 8,
    paddingBottom: 4,
  },
  clubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  clubPillActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.14,
    elevation: 2,
  },
  clubPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  clubPillTextActive: {
    color: '#15803D',
  },
  clubPillDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },

  // ── Section labels ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 28,
  },

  // ── Metrics 2×2 grid ──────────────────────────────────────────────────────
  metricsGrid: {
    gap: 0,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricsRowGap: {
    marginTop: 10,
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
    gap: 4,
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
  metricSubLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D1D5DB',
    letterSpacing: 0.2,
  },
  commissionHint: {
    marginTop: 10,
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 16,
  },
  commissionHintBold: {
    fontWeight: '700',
    color: '#6B7280',
  },

  // ── CourtPicker breakout ──────────────────────────────────────────────────
  courtPickerWrapper: {
    marginHorizontal: -HORIZONTAL_PAD,
  },

  // ── Price editor card ─────────────────────────────────────────────────────
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

  // ── Schedule ─────────────────────────────────────────────────────────────
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

  // ── Slot rows ─────────────────────────────────────────────────────────────
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

  // ── Status badge ─────────────────────────────────────────────────────────
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

  // ── Action buttons ────────────────────────────────────────────────────────
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
