import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { FirebaseError } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, { Easing, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { WebView } from 'react-native-webview';

import { BookingSummaryModal } from '../components/BookingSummaryModal';
import { CourtPicker } from '../components/CourtPicker';
import { HorizontalDayPicker } from '../components/HorizontalDayPicker';
import { TimeSlotGrid } from '../components/TimeSlotGrid';
import { IS_MOCK_MODE } from '../config/app';
import { getClubById, getCourtById, getCourtsByClubId } from '../config/data';
import { useAuth } from '../context/AuthContext';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import type { ExploreStackParamList, RootTabParamList } from '../navigation/types';
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

type BookingNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<ExploreStackParamList, 'BookingScreen'>,
  BottomTabNavigationProp<RootTabParamList>
>;

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

const CUBIC_OUT   = Easing.out(Easing.cubic);
const H_PAD       = 20;
const SECTION_GAP = 24;
const TAB_BAR_BOTTOM     = 0;
const TAB_BAR_HEIGHT     = 68;
const FOOTER_SAFE_PAD    = 10;

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1554068865-24cecd4e24b8?w=1200&q=80';

const AMENITIES = [
  { icon: '🎾', title: 'Zemin', subtitle: 'Toprak Kort' },
  { icon: '🚿', title: 'Duş & Soyunma', subtitle: 'Odası' },
  { icon: '☕', title: 'Kafe & Dinlenme', subtitle: 'Alanı' },
  { icon: '🅿️', title: 'Ücretsiz', subtitle: 'Otopark' },
] as const;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type SectionTitleProps = { children: string };

function SectionTitle({ children }: SectionTitleProps) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function TrustBanner() {
  return (
    <View style={styles.trustBanner}>
      <ShieldCheck size={18} color="#15803D" strokeWidth={2.2} />
      <Text style={styles.trustBannerText}>
        Ücretsiz İptal: Maça 12 saat kalana kadar kesintisiz iade hakkı.
      </Text>
    </View>
  );
}

type AmenityCardProps = { icon: string; title: string; subtitle: string };

function AmenityCard({ icon, title, subtitle }: AmenityCardProps) {
  return (
    <View style={styles.amenityCard}>
      <Text style={styles.amenityIcon}>{icon}</Text>
      <View style={styles.amenityTextWrap}>
        <Text style={styles.amenityTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.amenitySubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function BookingScreen() {
  const navigation = useNavigation<BookingNavProp>();
  const insets     = useSafeAreaInsets();
  const { uid }    = useAuth();
  const { requireVerification } = useVerificationGuard();
  const route      = useRoute<RouteProp<ExploreStackParamList, 'BookingScreen'>>();
  const { clubId } = route.params;

  const clubCourts = useMemo(() => getCourtsByClubId(clubId), [clubId]);
  const club       = useMemo(() => getClubById(clubId), [clubId]);

  const defaultCourtId = (clubCourts[0]?.id ?? 'court_1') as CourtId;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<CourtId>(defaultCourtId);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLocking, setIsLocking] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showMockPayment, setShowMockPayment] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<number>(0);
  const [bookingToastVisible, setBookingToastVisible] = useState(false);
  const bookingToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [livePrices, setLivePrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(clubCourts.map((c) => [c.id, c.basePrice])),
  );

  const canSubmit = selectedDate !== null && selectedSlot !== null;
  const isProcessing = isLocking || isPaymentLoading;
  const isInPaymentFlow = showMockPayment || paymentUrl !== null;

  const selectedCourt = getCourtById(selectedCourtId);
  const courtPrice = livePrices[selectedCourtId] ?? selectedCourt.basePrice;
  const heroImageUrl = club.imageUrl || HERO_IMAGE;
  const footerBottom = TAB_BAR_BOTTOM + TAB_BAR_HEIGHT + FOOTER_SAFE_PAD + insets.bottom;

  const amenities = useMemo(
    () =>
      AMENITIES.map((item, index) =>
        index === 0
          ? { ...item, subtitle: `${selectedCourt.surface} Kort` }
          : item,
      ),
    [selectedCourt.surface],
  );

  const aboutText = useMemo(
    () =>
      `${club.name}, ${club.address} konumunda profesyonel kort bakımı ve üst düzey olanaklarla premium bir tenis deneyimi sunar.`,
    [club.address, club.name],
  );

  useEffect(() => {
    return () => {
      if (bookingToastTimer.current) clearTimeout(bookingToastTimer.current);
    };
  }, []);

  const showBookingSuccessToast = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBookingToastVisible(true);
    if (bookingToastTimer.current) clearTimeout(bookingToastTimer.current);
    bookingToastTimer.current = setTimeout(() => setBookingToastVisible(false), 2000);
  }, []);

  // ─── Subscriptions ──────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribers = clubCourts.map(({ id }) =>
      subscribeToCourtPrice(id, (price) =>
        setLivePrices((prev) => ({ ...prev, [id]: price })),
      ),
    );
    return () => unsubscribers.forEach((u) => u());
  }, [clubCourts]);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    return subscribeToSlots(selectedDate, selectedCourtId, setSlots);
  }, [selectedDate, selectedCourtId]);

  useEffect(() => {
    if (!selectedSlot || isInPaymentFlow || paymentSession) return;
    const found = slots.find((s) => s.time === selectedSlot);
    if (!found || found.status === 'FREE') return;
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    requireVerification(() => setIsModalVisible(true));
  }, [canSubmit, requireVerification]);

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
    showBookingSuccessToast();
    navigation.getParent<BottomTabNavigationProp<RootTabParamList>>()?.navigate('MyBookings');
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🎾 Rezervasyonunuz Onaylandı!',
        body: `${court.name} rezerve edildi. Kapı giriş kodunuz: TC-348`,
        sound: true,
      },
      trigger: null,
    }).catch(() => {});
  }, [navigation, selectedCourtId, showBookingSuccessToast]);

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedDate || !selectedSlot || isProcessing) return;

    const session: PaymentSession = {
      date: selectedDate,
      slotTime: selectedSlot,
      courtId: selectedCourtId,
    };

    setIsModalVisible(false);

    const existingSlotInfo = slots.find((s) => s.time === selectedSlot);
    if (
      existingSlotInfo?.status === 'LOCKED' &&
      existingSlotInfo.lockedBy === uid
    ) {
      let expiresAt = lockExpiresAt;

      if (expiresAt === 0 && existingSlotInfo.lockedAt) {
        expiresAt = existingSlotInfo.lockedAt + LOCK_DURATION_MS;
      }

      if (expiresAt === 0) {
        expiresAt = Date.now() + LOCK_DURATION_MS;
      }

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
      showBookingSuccessToast();

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
  }, [
    isProcessing,
    lockExpiresAt,
    selectedCourtId,
    selectedDate,
    selectedSlot,
    showBookingSuccessToast,
    slots,
    uid,
  ]);

  // ─── WebView payment screen ──────────────────────────────────────────────────

  if (paymentUrl) {
    return (
      <View style={[styles.paymentSafeArea, { paddingTop: insets.top }]}>
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
      </View>
    );
  }

  // ─── Main screen ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          canSubmit && { paddingBottom: footerBottom + 72 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Premium hero header ──────────────────── */}
        <View style={styles.hero}>
          <Image source={{ uri: heroImageUrl }} style={styles.heroImage} resizeMode="cover" />

          <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Defs>
              <LinearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity="0.08" />
                <Stop offset="0.45" stopColor="#000000" stopOpacity="0.18" />
                <Stop offset="1" stopColor="#000000" stopOpacity="0.78" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heroGrad)" />
          </Svg>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { top: insets.top + 10 }]}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <Text style={styles.heroClubName} numberOfLines={2}>{club.name}</Text>
            <View style={styles.heroAddressRow}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroAddress} numberOfLines={1}>{club.address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {bookingToastVisible && (
            <View style={styles.bookingToast} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={16} color="#15803D" style={{ marginRight: 6 }} />
              <Text style={styles.bookingToastText}>Slot başarıyla ayrıldı!</Text>
            </View>
          )}

          {IS_MOCK_MODE ? (
            <View style={styles.mockBanner}>
              <Text style={styles.mockBannerText}>🧪 Mock ödeme modu aktif</Text>
            </View>
          ) : null}

          {/* ── Price section ─────────────────────────── */}
          <View style={styles.priceCard}>
            <View style={styles.priceMeta}>
              <Text style={styles.priceLabel}>Seçili Kort</Text>
              <Text style={styles.priceCourtName} numberOfLines={1}>
                {selectedCourt.name} · {selectedCourt.surface}
              </Text>
            </View>
            <View style={styles.priceAmountWrap}>
              <Text style={styles.priceAmount}>₺{courtPrice}</Text>
              <Text style={styles.priceUnit}>/ saat</Text>
            </View>
          </View>

          <TrustBanner />

          {/* ── Booking flow ──────────────────────────── */}
          <View style={styles.bookingSection}>
            <Text style={styles.bookingSectionLabel}>Tarih Seçin</Text>
            <HorizontalDayPicker
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </View>

          <View style={styles.bookingSection}>
            <Text style={styles.bookingSectionLabel}>Kort Seçin</Text>
            <View style={styles.courtPickerWrapper}>
              <CourtPicker
                courts={clubCourts}
                selectedCourtId={selectedCourtId}
                onSelectCourt={handleSelectCourt}
                livePrices={livePrices}
              />
            </View>
          </View>

          <View style={styles.bookingSection}>
            <Text style={styles.bookingSectionLabel}>Saat Seçin</Text>
            {selectedDate ? (
              <TimeSlotGrid
                key={`${selectedCourtId}_${selectedDate}`}
                slots={slots}
                selectedSlot={selectedSlot}
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
          </View>

          {/* ── İptal Politikası ──────────────────────── */}
          <View style={styles.contentSection}>
            <SectionTitle>İptal Politikası</SectionTitle>
            <View style={styles.policyCard}>
              <Text style={styles.policyText}>
                Maç başlangıcına 12 saatten fazla süre varsa rezervasyonunuzu ücretsiz
                iptal edebilirsiniz. İade tutarı 1–3 iş günü içinde hesabınıza yansır.
              </Text>
            </View>
          </View>

          {/* ── Olanaklar ─────────────────────────────── */}
          <View style={styles.contentSection}>
            <SectionTitle>Olanaklar</SectionTitle>
            <View style={styles.amenitiesGrid}>
              {amenities.map((item) => (
                <AmenityCard
                  key={item.title}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                />
              ))}
            </View>
          </View>

          {/* ── Tesis Hakkında ────────────────────────── */}
          <View style={styles.contentSection}>
            <SectionTitle>Tesis Hakkında</SectionTitle>
            <View style={styles.aboutCard}>
              <Text style={styles.aboutText}>{aboutText}</Text>
              <View style={styles.aboutFacilitiesRow}>
                {club.facilities.map((facility) => (
                  <View key={facility} style={styles.aboutPill}>
                    <Text style={styles.aboutPillText}>{facility}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {canSubmit && (
        <Animated.View
          entering={SlideInDown.duration(320).easing(CUBIC_OUT)}
          exiting={SlideOutDown.duration(220)}
          style={[styles.footer, { bottom: footerBottom }]}
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

      {isProcessing && (
        <View style={styles.absoluteLoadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.loadingText}>Ödeme sayfası hazırlanıyor…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  scrollView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: TAB_BAR_BOTTOM + TAB_BAR_HEIGHT + FOOTER_SAFE_PAD + 80,
  },

  // ── Hero ───────────────────────────────────────────────────────────────────
  hero: {
    height: 280,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    left: H_PAD,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 2,
  },
  heroContent: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
    bottom: 22,
    zIndex: 2,
    gap: 6,
  },
  heroClubName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  heroAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroAddress: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
  },

  // ── Body ───────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: H_PAD,
    paddingTop: SECTION_GAP,
    gap: SECTION_GAP,
  },

  bookingToast: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  bookingToastText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803D',
  },

  mockBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  mockBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },

  // ── Price ──────────────────────────────────────────────────────────────────
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  priceMeta: { flex: 1, marginRight: 12, gap: 4 },
  priceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  priceCourtName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
  },
  priceAmountWrap: { alignItems: 'flex-end' },
  priceAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  priceUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Trust banner ───────────────────────────────────────────────────────────
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  trustBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#166534',
    lineHeight: 19,
  },

  // ── Booking sections ───────────────────────────────────────────────────────
  bookingSection: { gap: 14 },
  bookingSectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  courtPickerWrapper: {
    marginHorizontal: -H_PAD,
  },

  emptySlotHint: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  emptySlotIcon: { fontSize: 36 },
  emptySlotText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Content sections ───────────────────────────────────────────────────────
  contentSection: { gap: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },

  policyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  policyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 22,
  },

  amenitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  amenityCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  amenityIcon: { fontSize: 22 },
  amenityTextWrap: { flex: 1, gap: 1 },
  amenityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  amenitySubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },

  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  aboutText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 22,
  },
  aboutFacilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aboutPill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aboutPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  // ── Sticky footer ──────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
    backgroundColor: 'transparent',
  },
  submitButton: {
    height: 58,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 10,
    transform: [{ scale: 1.02 }],
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ── Loading overlay ────────────────────────────────────────────────────────
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

  // ── WebView payment ────────────────────────────────────────────────────────
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
  paymentHeaderSpacer: { minWidth: 110 },
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
