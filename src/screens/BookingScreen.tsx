import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { FirebaseError } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { BookingSummaryModal } from '../components/BookingSummaryModal';
import { HorizontalDayPicker } from '../components/HorizontalDayPicker';
import { TimeSlotGrid } from '../components/TimeSlotGrid';
import { IS_MOCK_MODE, TAB_BAR_HEIGHT, TEMP_USER_ID } from '../config/app';
import { MockPaymentScreen } from './MockPaymentScreen';
import { lockSlot, subscribeToSlots } from '../services/bookingService';
import { app } from '../services/firebase';
import type { SlotInfo } from '../types/booking';
import type { CreatePaymentSessionResponse } from '../types/payment';

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
};

export function BookingScreen() {
  const navigation = useNavigation<BookingNavProp>();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [isLocking, setIsLocking] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showMockPayment, setShowMockPayment] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);

  const canSubmit = selectedDate !== null && selectedSlot !== null;
  const isProcessing = isLocking || isPaymentLoading;
  const isInPaymentFlow = showMockPayment || paymentUrl !== null;

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }

    const unsubscribe = subscribeToSlots(selectedDate, setSlots);
    return unsubscribe;
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedSlot || isInPaymentFlow || paymentSession) {
      return;
    }

    const selected = slots.find((slot) => slot.time === selectedSlot);
    if (selected && selected.status !== 'FREE') {
      setSelectedSlot(null);
    }
  }, [slots, selectedSlot, isInPaymentFlow, paymentSession]);

  useEffect(() => {
    if (paymentUrl) {
      setIsLocking(false);
      setIsPaymentLoading(false);
    }
  }, [paymentUrl]);

  const handleSelectDate = useCallback((dateKey: string) => {
    setSelectedDate(dateKey);
    setSelectedSlot(null);
  }, []);

  const handleSelectSlot = useCallback((slot: string) => {
    setSelectedSlot(slot);
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
    setShowMockPayment(false);
    setPaymentSession(null);
    setSelectedSlot(null);
    navigation.navigate('MyBookings');
    Notifications.scheduleNotificationAsync({
      content: {
        title: '🎾 Rezervasyonunuz Onaylandı!',
        body: 'Mustafa Görkem Tenis Kulübü - Merkez Kort rezerve edildi. Kapı giriş kodunuz: TC-348',
        sound: true,
      },
      trigger: null,
    }).catch(() => {
      // Notification scheduling failed — non-critical, booking is still confirmed
    });
  }, [navigation]);

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedDate || !selectedSlot || isProcessing) {
      return;
    }

    const session: PaymentSession = {
      date: selectedDate,
      slotTime: selectedSlot,
    };

    // 1. Önce özet modalını kapatıp yerel yüklenme ekranını açıyoruz
    setIsModalVisible(false);
    setIsLocking(true);

    try {
      const secured = await lockSlot(session.date, session.slotTime, TEMP_USER_ID);

      if (!secured) {
        setIsLocking(false);
        Alert.alert(
          'Slot Unavailable',
          'This slot was just taken by someone else!',
        );
        setSelectedSlot(null);
        return;
      }

      setPaymentSession(session);

      if (IS_MOCK_MODE) {
        // 2. Kilitleme başarılı! Spinner'ı kapatıp UI thread'e nefes aldırıyoruz
        setIsLocking(false);
        setIsPaymentLoading(false);
        
        setTimeout(() => {
          setShowMockPayment(true);
        }, 150); // Pürüzsüz yerel slide-up tetikleyicisi
        return;
      }

      setIsPaymentLoading(true);

      const result = await createPaymentSession({
        date: session.date,
        slotTime: session.slotTime,
        userId: TEMP_USER_ID,
      });

      setPaymentUrl(result.data.paymentPageUrl);
    } catch (error) {
      setPaymentSession(null);
      setShowMockPayment(false);
      setIsLocking(false);
      setIsPaymentLoading(false);

      if (error instanceof FirebaseError) {
        if (error.code === 'functions/failed-precondition') {
          Alert.alert(
            'Slot Unavailable',
            'This slot was just taken by someone else!',
          );
          setSelectedSlot(null);
          return;
        }
      }

      Alert.alert(
        'Payment Error',
        'Unable to start payment. Please try again.',
      );
    }
  }, [isProcessing, selectedDate, selectedSlot]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.header}>Kort Rezervasyonu</Text>

          {IS_MOCK_MODE ? (
            <View style={styles.mockBanner}>
              <Text style={styles.mockBannerText}>Mock ödeme modu aktif</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Tarih Seçin</Text>
          <HorizontalDayPicker
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            Saat Seçin
          </Text>
          {selectedDate ? (
            <TimeSlotGrid
              key={selectedDate}
              slots={slots}
              onSelectSlot={handleSelectSlot}
            />
          ) : (
            <Text style={styles.helperText}>
              Lütfen önce bir tarih seçin.
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={!canSubmit || isProcessing}
            onPress={handleBooking}
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          >
            <Text
              style={[
                styles.submitButtonText,
                !canSubmit && styles.submitButtonTextDisabled,
              ]}
            >
              Rezervasyon Yap
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <BookingSummaryModal
        isVisible={isModalVisible}
        onClose={handleCloseModal}
        date={selectedDate ?? ''}
        time={selectedSlot ?? ''}
        onConfirm={handleConfirmPayment}
      />

      {paymentSession ? (
        <MockPaymentScreen
          isVisible={showMockPayment}
          date={paymentSession.date}
          slotTime={paymentSession.slotTime}
          onSuccess={handleMockPaymentSuccess}
          onCancel={handleMockPaymentCancel}
        />
      ) : null}

      {/* MODAL COLLISION ENGELLEYİCİ PREMIUM ABSOLUTE VIEW OVERLAY */}
      {isProcessing && (
        <View style={styles.absoluteLoadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.loadingText}>Ödeme sayfası hazırlanıyor...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  mainContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40, // Butonun arkasında boşluk kalması için optimize edildi
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 28,
  },
  mockBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
    marginTop: -8,
  },
  mockBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 14,
  },
  sectionLabelSpaced: {
    marginTop: 28,
  },
  helperText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  footer: {
    bottom: TAB_BAR_HEIGHT, // Tab bar yüksekliği kadar tam olarak responsive yukarı kaldırıldı
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  submitButtonTextDisabled: {
    color: '#9CA3AF',
  },
  absoluteLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 99999, // Her şeyin en üstünde kalmasını garanti ediyoruz
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