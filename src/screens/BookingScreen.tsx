import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { FirebaseError } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
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
import { WebView } from 'react-native-webview';

import { BookingSummaryModal } from '../components/BookingSummaryModal';
import { CourtPicker } from '../components/CourtPicker';
import { HorizontalDayPicker } from '../components/HorizontalDayPicker';
import { TimeSlotGrid } from '../components/TimeSlotGrid';
import { IS_MOCK_MODE } from '../config/app';
import { useAuth } from '../context/AuthContext';
import { COURT_IDS, DEFAULT_COURT_ID, getCourtById } from '../config/courts';
import {
  lockSlot,
  subscribeToCourtPrice,
  subscribeToSlots,
} from '../services/bookingService';
import { app } from '../services/firebase';
import { LOCK_DURATION_MS } from '../types/booking';
import type { CourtId, SlotInfo } from '../types/booking';
import type { CreatePaymentSessionResponse } from '../types/payment';
import { MockPaymentScreen } from './MockPaymentScreen';

type BookingNavProp = BottomTabNavigationProp<{
  Booking: undefined;
  MyBookings: undefined;
}>;

const functions = getFunctions(app);

const createPaymentSession = httpsCallable<
  { date: string; slotTime: string; userId: string },
  CreatePaymentSessionResponse
>(functions, 'createPaymentSession');

type PaymentSession = {
  date: string;
  slotTime: string;
  courtId: CourtId;
};

export function BookingScreen() {
  const navigation = useNavigation<BookingNavProp>();
  const { uid } = useAuth();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<CourtId>(DEFAULT_COURT_ID);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLocking, setIsLocking] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showMockPayment, setShowMockPayment] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  // Absolute epoch-ms when the current slot lock expires (lockedAt + 10 min)
  const [lockExpiresAt, setLockExpiresAt] = useState<number>(0);

  // Live prices for all courts — feeds CourtPicker cards + checkout modal simultaneously
  const [livePrices, setLivePrices] = useState<Record<string, number>>({
    court_1: getCourtById('court_1').basePrice,
    court_2: getCourtById('court_2').basePrice,
    court_3: getCourtById('court_3').basePrice,
  });

  const canSubmit = selectedDate !== null && selectedSlot !== null;
  const isProcessing = isLocking || isPaymentLoading;
  const isInPaymentFlow = showMockPayment || paymentUrl !== null;

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  // One subscription per court, set up once on mount — any admin price change
  // propagates immediately to every picker card without a court-switch required.
  useEffect(() => {
    const unsubscribers = COURT_IDS.map((id) =>
      subscribeToCourtPrice(id, (price) =>
        setLivePrices((prev) => ({ ...prev, [id]: price })),
      ),
    );
    return () => unsubscribers.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    return subscribeToSlots(selectedDate, selectedCourtId, setSlots);
  }, [selectedDate, selectedCourtId]);

  // Deselect slot if it becomes unavailable — but preserve selection if WE hold the lock
  useEffect(() => {
    if (!selectedSlot || isInPaymentFlow || paymentSession) return;
    const found = slots.find((s) => s.time === selectedSlot);
    if (!found || found.status === 'FREE') return;
    // Keep selected if it's our own lock (re-entry into the payment flow)
    if (found.status === 'LOCKED' && found.lockedBy === uid) return;
    setSelectedSlot(null);
  }, [slots, selectedSlot, isInPaymentFlow, paymentSession, uid]);

  useEffect(() => {
    if (paymentUrl) {
      setIsLocking(false);
      setIsPaymentLoading(false);
    }
  }, [paymentUrl]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectDate = useCallback((dateKey: string) => {
    if (dateKey === selectedDate) {
      setSelectedDate(null);
      setSelectedSlot(null);
    } else {
      setSelectedDate(dateKey);
      setSelectedSlot(null);
    }
  }, [selectedDate]);

  const handleSelectCourt = useCallback((courtId: CourtId) => {
    setSelectedCourtId(courtId);
    setSelectedSlot(null);
  }, []);

  const handleSelectSlot = useCallback((slot: string) => {
    setSelectedSlot((prev) => (prev === slot ? null : slot));
  }, []);

  const handleBooking = useCallback(() => {
    if (!canSubmit) return;
    setIsModalVisible(true);
  }, [canSubmit]);

  const handleCloseModal = useCallback(() => {
    if (isProcessing) return;
    setIsModalVisible(false);
  }, [isProcessing]);

  const handleAbortPayment = useCallback(() => {
    setPaymentUrl(null);
    setPaymentSession(null);
  }, []);

  const handleMockPaymentCancel = useCallback(() => {
    setShowMockPayment(false);
    setPaymentSession(null);
    setSelectedSlot(null);
  }, []);

  const handleMockPaymentSuccess = useCallback(() => {
    const court = getCourtById(selectedCourtId);
    setShowMockPayment(false);
    setPaymentSession(null);
    setSelectedSlot(null);
    navigation.navigate('MyBookings');
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🎾 Rezervasyonunuz Onaylandı!',
        body: `${court.name} rezerve edildi. Kapı giriş kodunuz: TC-348`,
        sound: true,
      },
      trigger: null,
    }).catch(() => {
      // Non-critical — booking already confirmed in Firestore
    });
  }, [navigation, selectedCourtId]);

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedDate || !selectedSlot || isProcessing) return;

    const session: PaymentSession = {
      date: selectedDate,
      slotTime: selectedSlot,
      courtId: selectedCourtId,
    };

    setIsModalVisible(false);

    // ── Re-entry: user already holds the lock for this slot ──────────────────
    const existingSlotInfo = slots.find((s) => s.time === selectedSlot);
    if (
      existingSlotInfo?.status === 'LOCKED' &&
      existingSlotInfo.lockedBy === uid
    ) {
      // 1. Trust our local session state first (survives modal close, immune to pending writes)
      let expiresAt = lockExpiresAt;

      // 2. If state was lost (e.g., app cold restart), rely on Firestore's real server timestamp
      if (expiresAt === 0 && existingSlotInfo.lockedAt) {
        expiresAt = existingSlotInfo.lockedAt + LOCK_DURATION_MS;
      }

      // 3. Ultimate fallback (only hits during first-ever lock attempt if offline)
      if (expiresAt === 0) {
        expiresAt = Date.now() + LOCK_DURATION_MS;
      }

      // 4. Guard against expired locks
      if (expiresAt <= Date.now()) {
        Alert.alert('Kilit Süresi Doldu', 'Slot kilidi sona erdi. Lütfen tekrar seçin.');
        setSelectedSlot(null);
        return;
      }

      setLockExpiresAt(expiresAt);
      setPaymentSession(session);
      if (IS_MOCK_MODE) setTimeout(() => setShowMockPayment(true), 150);
      return;
    }

    // ── Normal path: acquire a fresh lock ────────────────────────────────────
    setIsLocking(true);

    try {
      const { secured, lockedAt } = await lockSlot(
        session.date,
        session.slotTime,
        uid,
        session.courtId,
      );

      if (!secured) {
        setIsLocking(false);
        Alert.alert('Slot Alındı', 'Bu slot az önce başkası tarafından alındı!');
        setSelectedSlot(null);
        return;
      }

      setLockExpiresAt(lockedAt + LOCK_DURATION_MS);
      setPaymentSession(session);

      if (IS_MOCK_MODE) {
        setIsLocking(false);
        setIsPaymentLoading(false);
        setTimeout(() => setShowMockPayment(true), 150);
        return;
      }

      setIsPaymentLoading(true);

      const result = await createPaymentSession({
        date: session.date,
        slotTime: session.slotTime,
        userId: uid,
      });

      setPaymentUrl(result.data.paymentPageUrl);
    } catch (error) {
      setPaymentSession(null);
      setShowMockPayment(false);
      setIsLocking(false);
      setIsPaymentLoading(false);

      if (error instanceof FirebaseError) {
        if (error.code === 'functions/failed-precondition') {
          Alert.alert('Slot Alındı', 'Bu slot az önce başkası tarafından alındı!');
          setSelectedSlot(null);
          return;
        }
      }

      Alert.alert('Ödeme Hatası', 'Ödeme başlatılamadı. Lütfen tekrar deneyin.');
    }
  }, [isProcessing, selectedCourtId, selectedDate, selectedSlot, slots, uid]);

  // ─── WebView payment screen ──────────────────────────────────────────────────

  if (paymentUrl) {
    return (
      <SafeAreaView style={styles.paymentSafeArea}>
        <View style={styles.paymentHeader}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleAbortPayment}
            style={styles.paymentCloseButton}
          >
            <Text style={styles.paymentCloseText}>Vazgeç / Kapat</Text>
          </TouchableOpacity>
          <Text style={styles.paymentHeaderTitle}>Güvenli Ödeme</Text>
          <View style={styles.paymentHeaderSpacer} />
        </View>
        <WebView
          source={{ uri: paymentUrl }}
          style={styles.webView}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webViewLoader}>
              <ActivityIndicator size="large" color="#22C55E" />
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // ─── Main screen ─────────────────────────────────────────────────────────────

  const selectedCourt = getCourtById(selectedCourtId);
  const courtPrice = livePrices[selectedCourtId] ?? selectedCourt.basePrice;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/*
        Layout:
          ┌──────────────────────────────┐
          │  ScrollView — all content    │  flex: 1
          │    paddingBottom grows when  │
          │    the CTA footer appears    │
          ├──────────────────────────────┤
          │  Sticky CTA footer           │  only rendered when canSubmit
          └──────────────────────────────┘
      */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          // When the sticky CTA is visible, add extra bottom clearance so the
          // last slot card scrolls fully above the button.
          canSubmit && styles.scrollContentWithCTA,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Screen title ────────────────────────────── */}
        <Text style={styles.header}>Kort Rezervasyonu</Text>

        {IS_MOCK_MODE ? (
          <View style={styles.mockBanner}>
            <Text style={styles.mockBannerText}>🧪 Mock ödeme modu aktif</Text>
          </View>
        ) : null}

        {/* ── 1. Tarih ────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Tarih Seçin</Text>
        <HorizontalDayPicker
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />

        {/* ── 2. Kort ─────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Kort Seçin
        </Text>
        {/*
          Negative horizontal margin breaks CourtPicker out of the parent's
          paddingHorizontal so it scrolls edge-to-edge. CourtPicker's own
          contentContainerStyle re-applies paddingHorizontal: 20 for alignment.
        */}
        <View style={styles.courtPickerWrapper}>
          <CourtPicker
            selectedCourtId={selectedCourtId}
            onSelectCourt={handleSelectCourt}
            livePrices={livePrices}
          />
        </View>

        {/* ── 3. Saat ─────────────────────────────────── */}
        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          Saat Seçin
        </Text>
        {selectedDate ? (
          <TimeSlotGrid
            key={`${selectedCourtId}_${selectedDate}`}
            slots={slots}
            onSelectSlot={handleSelectSlot}
            currentUserId={uid}
          />
        ) : (
          <View style={styles.emptySlotHint}>
            <Text style={styles.emptySlotIcon}>📅</Text>
            <Text style={styles.emptySlotText}>
              Uygun saatleri görmek için{'\n'}bir tarih seçin
            </Text>
          </View>
        )}
      </ScrollView>

      {/*
        Airbnb-style CTA: only rendered when the user has made a selection.
        Disappears completely when no slot is chosen so it never blocks content.
        Uses upward shadow instead of a border for premium visual separation.
      */}
      {canSubmit && (
        <Animated.View
          entering={SlideInDown.springify().mass(0.3).damping(18).stiffness(120)}
          exiting={SlideOutDown.duration(200)}
          style={styles.footer}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isProcessing}
            onPress={handleBooking}
            style={styles.submitButton}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Rezervasyon Yap</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Modals ────────────────────────────────────── */}
      <BookingSummaryModal
        isVisible={isModalVisible}
        onClose={handleCloseModal}
        date={selectedDate ?? ''}
        time={selectedSlot ?? ''}
        onConfirm={handleConfirmPayment}
        courtName={`${selectedCourt.name} · ${selectedCourt.surface}`}
        price={courtPrice}
      />

      {paymentSession ? (
        <MockPaymentScreen
          isVisible={showMockPayment}
          date={paymentSession.date}
          slotTime={paymentSession.slotTime}
          courtId={paymentSession.courtId}
          courtName={getCourtById(paymentSession.courtId).name}
          price={courtPrice}
          lockExpiresAt={lockExpiresAt}
          onSuccess={handleMockPaymentSuccess}
          onCancel={handleMockPaymentCancel}
        />
      ) : null}

      {/* Full-screen spinner during Firestore lock + payment init */}
      {isProcessing && (
        <View style={styles.absoluteLoadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.loadingText}>Ödeme sayfası hazırlanıyor…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const H_PAD = 20; // horizontal page padding

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // ── Scroll body ────────────────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: H_PAD,
    paddingTop: 28,
    // 100 px clears the floating tab bar (bottom:24 + height:64 + ~12 gap)
    // even when the CTA button is not visible.
    paddingBottom: 100,
  },
  // Applied on top of scrollContent when the CTA footer is visible
  scrollContentWithCTA: {
    // 220 px clears the 54 px CTA button sitting at bottom:104 above the
    // floating tab bar, ensuring the last slot row scrolls fully into view.
    paddingBottom: 220,
  },

  // ── Page title ─────────────────────────────────────────────────────────────
  header: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.8,
    marginBottom: 24,
  },

  // ── Mock mode banner ───────────────────────────────────────────────────────
  mockBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 24,
    marginTop: -4,
  },
  mockBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },

  // ── Section labels ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  sectionLabelSpaced: {
    marginTop: 32,
  },

  // ── CourtPicker edge-to-edge breakout ──────────────────────────────────────
  courtPickerWrapper: {
    marginHorizontal: -H_PAD,
  },

  // ── Empty-state hint for the slot grid ─────────────────────────────────────
  emptySlotHint: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptySlotIcon: {
    fontSize: 36,
  },
  emptySlotText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Floating CTA footer ────────────────────────────────────────────────────
  // Sits above the floating tab bar (bottom:24 + height:64 + 16px gap = 104).
  // Transparent container lets the scroll content show through underneath.
  footer: {
    position: 'absolute',
    bottom: 104,
    left: 20,
    right: 20,
    backgroundColor: 'transparent',
  },
  submitButton: {
    height: 54,
    backgroundColor: '#22C55E',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Full-screen loading overlay ────────────────────────────────────────────
  absoluteLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 99999,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  // ── WebView payment screen ─────────────────────────────────────────────────
  paymentSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  paymentCloseButton: {
    minWidth: 110,
    paddingVertical: 6,
  },
  paymentCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  paymentHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  paymentHeaderSpacer: {
    minWidth: 110,
  },
  webView: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  webViewLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
});
