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
import { useTheme } from '../context/ThemeContext';
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
import type { ColorTokens } from '../theme/tokens';
import type { AdminSlotInfo, CourtId, SlotStatus } from '../types/booking';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Marketplace platform fee deducted from club gross revenue. */
const COMMISSION_RATE = 0.2;
const HORIZONTAL_PAD  = 20;

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background.secondary,
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
      color: c.text.primary,
      letterSpacing: -0.4,
      marginBottom: 10,
      textAlign: 'center',
    },
    guardBody: {
      fontSize: 14,
      fontWeight: '400',
      color: c.text.muted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    guardSignOutBtn: {
      backgroundColor: c.status.danger + '22',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 14,
    },
    guardSignOutText: {
      fontSize: 14,
      fontWeight: '700',
      color: c.status.danger,
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
      backgroundColor: c.status.danger + '14',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    pageTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      marginTop: 3,
      fontSize: 12,
      fontWeight: '600',
      color: c.text.muted,
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
      backgroundColor: c.surface.card,
      borderWidth: 1.5,
      borderColor: c.border.default,
      gap: 7,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    clubPillActive: {
      backgroundColor: c.status.success + '1A',
      borderColor: c.status.success,
      shadowColor: c.status.success,
      shadowOpacity: 0.14,
      elevation: 2,
    },
    clubPillText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.primary,
    },
    clubPillTextActive: {
      color: c.status.success,
    },
    clubPillDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: c.status.success,
    },

    // ── Section labels ────────────────────────────────────────────────────────
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.muted,
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
      backgroundColor: c.surface.card,
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
      color: c.text.muted,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    metricSubLabel: {
      fontSize: 9,
      fontWeight: '700',
      color: c.border.default,
      letterSpacing: 0.2,
    },
    commissionHint: {
      marginTop: 10,
      fontSize: 11,
      color: c.text.muted,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 16,
    },
    commissionHintBold: {
      fontWeight: '700',
      color: c.text.muted,
    },

    // ── CourtPicker breakout ──────────────────────────────────────────────────
    courtPickerWrapper: {
      marginHorizontal: -HORIZONTAL_PAD,
    },

    // ── Price editor card ─────────────────────────────────────────────────────
    priceEditorCard: {
      backgroundColor: c.surface.card,
      borderRadius: 16,
      padding: 16,
      marginTop: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
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
      color: c.text.primary,
      letterSpacing: -0.2,
    },
    priceEditorHint: {
      fontSize: 11,
      fontWeight: '500',
      color: c.text.muted,
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
      color: c.text.primary,
      letterSpacing: -0.5,
    },
    priceEditBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.surface.raised,
    },
    priceEditBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.primary,
    },
    priceEditRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    priceInput: {
      flex: 1,
      backgroundColor: c.background.secondary,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.accent.primary,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 16,
      fontWeight: '700',
      color: c.text.primary,
    },
    priceSaveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.accent.primary,
      minWidth: 72,
      alignItems: 'center',
    },
    priceSaveBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text.inverse,
    },
    priceCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.surface.raised,
    },
    priceCancelBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.muted,
    },

    // ── Schedule ─────────────────────────────────────────────────────────────
    scheduleLoading: {
      height: 160,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scheduleCard: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border.default,
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
      color: c.text.primary,
      letterSpacing: 0.2,
    },
    slotCenter: {
      flex: 1,
      gap: 3,
    },
    slotUserId: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text.primary,
    },
    slotPaymentId: {
      fontSize: 11,
      color: c.text.muted,
    },
    slotRight: {
      width: 80,
      alignItems: 'flex-end',
      justifyContent: 'center',
      minHeight: 34,
    },

    // ── Status badge — domain semantic colors, not theme tokens ──────────────
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
      color: c.text.inverse,
      letterSpacing: 0.2,
    },
    btnBlock:   { backgroundColor: c.status.warning },
    btnUnblock: { backgroundColor: c.status.success },
    btnCancel:  { backgroundColor: c.status.danger },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayKey(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Domain slot-status badge colours ─────────────────────────────────────────
// These are intentional fixed semantic colours representing operational states,
// not brand/theme colours, so they stay fixed across light and dark mode.

const STATUS_CONFIG: Record<SlotStatus, { label: string; bg: string; text: string }> = {
  FREE:      { label: 'Müsait',  bg: '#DCFCE7', text: '#15803D' },
  LOCKED:    { label: 'Kilitli', bg: '#FEF3C7', text: '#92400E' },
  CONFIRMED: { label: 'Dolu',    bg: '#DBEAFE', text: '#1E40AF' },
  BLOCKED:   { label: 'Bloke',   bg: '#FEE2E2', text: '#991B1B' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type MetricCardProps = {
  icon: string;
  label: string;
  value: string;
  accent: string;
  subLabel?: string;
};

function MetricCard({ icon, label, value, accent, subLabel }: MetricCardProps) {
  const { theme, colorScheme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  return (
    <View style={[S.metricCard, { borderTopColor: accent }]}>
      <Text style={S.metricIcon}>{icon}</Text>
      <Text
        style={[S.metricValue, { color: accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={S.metricLabel}>{label}</Text>
      {subLabel ? <Text style={S.metricSubLabel}>{subLabel}</Text> : null}
    </View>
  );
}

type StatusBadgeProps = { status: SlotStatus };

function StatusBadge({ status }: StatusBadgeProps) {
  const { theme, colorScheme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);
  const cfg = STATUS_CONFIG[status];

  return (
    <View style={[S.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[S.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

type AdminSlotRowProps = {
  slot: AdminSlotInfo;
  date: string;
  courtId: CourtId;
};

function AdminSlotRow({ slot, date, courtId }: AdminSlotRowProps) {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

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
    <View style={S.slotRow}>
      <View style={S.slotLeft}>
        <Text style={S.slotTime}>{slot.time}</Text>
        <StatusBadge status={slot.status} />
      </View>

      <View style={S.slotCenter}>
        {slot.userId ? (
          <Text style={S.slotUserId} numberOfLines={1}>
            {slot.userId}
          </Text>
        ) : null}
        {slot.paymentId ? (
          <Text style={S.slotPaymentId} numberOfLines={1}>
            #{slot.paymentId}
          </Text>
        ) : null}
      </View>

      <View style={S.slotRight}>
        {isBusy ? (
          <ActivityIndicator size="small" color={c.text.muted} />
        ) : (
          <>
            {slot.status === 'FREE' && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleBlock}
                style={[S.actionBtn, S.btnBlock]}
              >
                <Text style={S.actionBtnText}>Bloke Et</Text>
              </TouchableOpacity>
            )}
            {slot.status === 'BLOCKED' && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleUnblock}
                style={[S.actionBtn, S.btnUnblock]}
              >
                <Text style={S.actionBtnText}>Aç</Text>
              </TouchableOpacity>
            )}
            {(slot.status === 'CONFIRMED' || slot.status === 'LOCKED') && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleCancel}
                style={[S.actionBtn, S.btnCancel]}
              >
                <Text style={S.actionBtnText}>İptal Et</Text>
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
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  // ── Club scope ─────────────────────────────────────────────────────────────
  const [superAdminClubId, setSuperAdminClubId] = useState<string>(CLUBS[0]?.id ?? '');
  const scopedClubId  = role === 'club_admin' ? managedClubId : superAdminClubId;
  const scopedClub    = useMemo(() => getClubById(scopedClubId), [scopedClubId]);
  const scopedCourts  = useMemo(() => getCourtsByClubId(scopedClubId), [scopedClubId]);

  const isMisconfigured = role === 'club_admin' && !managedClubId;

  // ── Date & court selection ─────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState<string>(getTodayKey());
  const [selectedCourtId, setSelectedCourtId] = useState<CourtId>(
    (scopedCourts[0]?.id ?? 'court_1') as CourtId,
  );

  useEffect(() => {
    const first = getCourtsByClubId(scopedClubId)[0];
    if (first) setSelectedCourtId(first.id as CourtId);
  }, [scopedClubId]);

  // ── Slot state ─────────────────────────────────────────────────────────────
  const [courtSlots, setCourtSlots]         = useState<AdminSlotInfo[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [allCourtsSlots, setAllCourtsSlots] = useState<Record<string, AdminSlotInfo[]>>({});

  // ── Price state ────────────────────────────────────────────────────────────
  const [allPrices, setAllPrices]       = useState<Record<string, number>>({});
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  const courtPrice = allPrices[selectedCourtId] ?? getCourtById(selectedCourtId).basePrice;

  useEffect(() => {
    setIsLoadingSlots(true);
    return subscribeToAdminSlots(selectedDate, selectedCourtId, (nextSlots) => {
      setCourtSlots(nextSlots);
      setIsLoadingSlots(false);
    });
  }, [selectedDate, selectedCourtId]);

  useEffect(() => {
    const ids = getCourtsByClubId(scopedClubId).map((c) => c.id) as CourtId[];
    setAllCourtsSlots(Object.fromEntries(ids.map((id) => [id, []])));
    return subscribeToSelectedCourtsAdminSlots(selectedDate, ids, setAllCourtsSlots);
  }, [selectedDate, scopedClubId]);

  useEffect(() => {
    const courts = getCourtsByClubId(scopedClubId);
    setAllPrices(Object.fromEntries(courts.map((c) => [c.id, c.basePrice])));
    const unsubs = courts.map(({ id }) =>
      subscribeToCourtPrice(id as CourtId, (price) =>
        setAllPrices((prev) => ({ ...prev, [id]: price })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [scopedClubId]);

  useEffect(() => {
    setEditingPrice(null);
  }, [selectedCourtId]);

  // ── Aggregate metrics ────────────────────────────────────────────────────────
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
      <View style={[S.container, S.centeredGuard, { paddingTop: insets.top }]}>
        <Text style={S.guardEmoji}>⚠️</Text>
        <Text style={S.guardTitle}>Kulüp Atanmamış</Text>
        <Text style={S.guardBody}>
          Hesabınıza henüz bir kulüp atanmamış.{'\n'}
          Lütfen platform yöneticinizle iletişime geçin.
        </Text>
        <TouchableOpacity
          style={S.guardSignOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={S.guardSignOutText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[S.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={S.scrollView}
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 1. Header ──────────────────────────────────────────── */}
        <View style={S.pageHeader}>
          <View style={S.headerTextBlock}>
            <Text style={S.pageTitle} numberOfLines={1} adjustsFontSizeToFit>
              {scopedClub.name}
            </Text>
            <Text style={S.pageSubtitle}>Yönetim Paneli</Text>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={S.signOutBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={22} color={c.status.danger} />
          </TouchableOpacity>
        </View>

        {/* ── 2. Club Selector (super_admin only) ────────────────── */}
        {role === 'super_admin' && (
          <>
            <Text style={S.sectionLabel}>Kulüp Görünümü</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.clubSelectorRow}
            >
              {CLUBS.map((club) => {
                const isActive = club.id === scopedClubId;
                return (
                  <TouchableOpacity
                    key={club.id}
                    onPress={() => setSuperAdminClubId(club.id)}
                    style={[S.clubPill, isActive && S.clubPillActive]}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        S.clubPillText,
                        isActive && S.clubPillTextActive,
                      ]}
                    >
                      {club.name}
                    </Text>
                    {isActive && (
                      <View style={S.clubPillDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── 3. Tarih ───────────────────────────────────────────── */}
        <Text style={[S.sectionLabel, S.sectionLabelSpaced]}>Tarih</Text>
        <HorizontalDayPicker
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* ── 4. Financial Summary (scoped to club) ──────────────── */}
        <Text style={[S.sectionLabel, S.sectionLabelSpaced]}>
          Günlük Özet — {scopedCourts.length} Kort
        </Text>

        <View style={S.metricsGrid}>
          <View style={S.metricsRow}>
            <MetricCard
              icon="📊"
              label="Doluluk Oranı"
              value={`%${aggregateMetrics.occupancy}`}
              accent={c.status.success}
            />
            <MetricCard
              icon="💰"
              label="Bugünkü Ciro"
              value={`${aggregateMetrics.grossRevenue.toLocaleString('tr-TR')} TL`}
              accent={c.accent.secondary}
            />
          </View>

          <View style={[S.metricsRow, S.metricsRowGap]}>
            <MetricCard
              icon="🏦"
              label="Net Hakediş"
              value={`${aggregateMetrics.netPayout.toLocaleString('tr-TR')} TL`}
              accent={c.status.success}
              subLabel="%80"
            />
            <MetricCard
              icon="📉"
              label="Platform Kesintisi"
              value={`${aggregateMetrics.commission.toLocaleString('tr-TR')} TL`}
              accent={c.status.warning}
              subLabel="%20"
            />
          </View>

          <Text style={S.commissionHint}>
            %{Math.round(COMMISSION_RATE * 100)} platform komisyonu düşülmüş net hakediş tutarı. Bloke:&nbsp;
            <Text style={S.commissionHintBold}>
              {aggregateMetrics.blockedSlots} saat
            </Text>
          </Text>
        </View>

        {/* ── 5. Court Selector (filtered to scoped club) ────────── */}
        <Text style={[S.sectionLabel, S.sectionLabelSpaced]}>
          Kort Seçimi
        </Text>
        <View style={S.courtPickerWrapper}>
          <CourtPicker
            selectedCourtId={selectedCourtId}
            onSelectCourt={handleSelectCourt}
            courts={scopedCourts}
            livePrices={allPrices}
          />
        </View>

        {/* ── 6. Price editor ────────────────────────────────────── */}
        <View style={S.priceEditorCard}>
          <View style={S.priceEditorHeader}>
            <View>
              <Text style={S.priceEditorCourtName}>{selectedCourt.name}</Text>
              <Text style={S.priceEditorHint}>Saatlik Ücret</Text>
            </View>
          </View>

          {editingPrice !== null ? (
            <View style={S.priceEditRow}>
              <TextInput
                value={editingPrice}
                onChangeText={setEditingPrice}
                keyboardType="number-pad"
                style={S.priceInput}
                autoFocus
                selectTextOnFocus
                placeholder="Yeni fiyat (TL)"
                placeholderTextColor={c.text.muted}
              />
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSavePrice}
                disabled={isSavingPrice}
                style={S.priceSaveBtn}
              >
                {isSavingPrice ? (
                  <ActivityIndicator size="small" color={c.text.inverse} />
                ) : (
                  <Text style={S.priceSaveBtnText}>Kaydet</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEditingPrice(null)}
                style={S.priceCancelBtn}
              >
                <Text style={S.priceCancelBtnText}>İptal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={S.priceDisplayRow}>
              <Text style={S.priceDisplay}>
                {courtPrice.toLocaleString('tr-TR')} TL
              </Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setEditingPrice(String(courtPrice))}
                style={S.priceEditBtn}
              >
                <Text style={S.priceEditBtnText}>✏️ Düzenle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── 7. Daily Schedule ──────────────────────────────────── */}
        <Text style={[S.sectionLabel, S.sectionLabelSpaced]}>
          Günlük Program — {selectedCourt.name}
        </Text>

        {isLoadingSlots ? (
          <View style={S.scheduleLoading}>
            <ActivityIndicator size="large" color={c.accent.primary} />
          </View>
        ) : (
          <View style={S.scheduleCard}>
            {courtSlots.map((slot, index) => (
              <View key={slot.time}>
                {index > 0 && <View style={S.divider} />}
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
