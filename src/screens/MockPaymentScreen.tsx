import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { confirmSlot, unlockSlot } from '../services/bookingService';
import type { ColorTokens } from '../theme/tokens';
import type { CourtId } from '../types/booking';

const COUNTDOWN_TOTAL = 5 * 60; // 300 s — mirrors LOCK_DURATION_MS

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 32,
    },

    // ── Mock banner — intentional amber/warning, semantic decorator ─────────────
    banner: {
      backgroundColor: c.status.warning + '26',
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: c.status.warning + '59',
      marginBottom: 24,
    },
    bannerTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: c.status.warning,
      letterSpacing: 1,
      marginBottom: 4,
    },
    bannerText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.status.warning,
    },

    // ── Credit card preview — intentionally dark to mimic a physical card ───────
    cardPreview: {
      backgroundColor: '#111827',
      borderRadius: 20,
      padding: 24,
      marginBottom: 28,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#9CA3AF',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 18,
    },
    cardNumberPreview: {
      fontSize: 22,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 1.5,
      marginBottom: 24,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    cardMeta: {
      fontSize: 14,
      fontWeight: '600',
      color: '#D1D5DB',
    },

    // ── Form ─────────────────────────────────────────────────────────────────────
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text.primary,
      marginBottom: 16,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.muted,
      marginBottom: 8,
    },
    input: {
      backgroundColor: c.surface.card,
      borderWidth: 1,
      borderColor: c.border.default,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: c.text.primary,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    halfField: {
      flex: 1,
    },

    // ── Summary card ──────────────────────────────────────────────────────────────
    summaryCard: {
      backgroundColor: c.surface.card,
      borderRadius: 18,
      padding: 18,
      marginTop: 8,
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
    },
    summaryLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    summaryFacility: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text.primary,
      marginBottom: 6,
    },
    summaryMeta: {
      fontSize: 14,
      color: c.text.muted,
      marginBottom: 10,
    },
    summaryPrice: {
      fontSize: 22,
      fontWeight: '700',
      color: c.status.success,
    },

    // ── Buttons ───────────────────────────────────────────────────────────────────
    submitButton: {
      backgroundColor: c.accent.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text.inverse,
    },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.status.danger,
    },

    // ── Countdown timer banner ────────────────────────────────────────────────────
    timerBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.status.warning + '1A',
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: c.status.warning + '47',
      marginBottom: 20,
    },
    timerBannerUrgent: {
      backgroundColor: c.status.danger + '14',
      borderColor: c.status.danger + '33',
    },
    timerLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.status.warning,
    },
    timerLabelUrgent: {
      color: c.status.danger,
    },
    timerValue: {
      fontSize: 20,
      fontWeight: '800',
      color: c.status.warning,
      letterSpacing: 1,
      fontVariant: ['tabular-nums'],
    },
    timerValueUrgent: {
      color: c.status.danger,
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type MockPaymentScreenProps = {
  isVisible: boolean;
  date: string;
  slotTime: string;
  courtId: CourtId;
  courtName: string;
  price: number;
  /** Absolute epoch-ms when the Firestore lock expires (lockedAt + LOCK_DURATION_MS) */
  lockExpiresAt: number;
  onSuccess: () => void;
  onCancel: () => void;
};

export function MockPaymentScreen({
  isVisible,
  date,
  slotTime,
  courtId,
  courtName,
  price,
  lockExpiresAt,
  onSuccess,
  onCancel,
}: MockPaymentScreenProps) {
  const { uid } = useAuth();
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  const [cardNumber, setCardNumber] = useState('5528 7900 0000 0008');

  // ── 10-minute countdown ────────────────────────────────────────────────────
  const [remainingSeconds, setRemainingSeconds] = useState(COUNTDOWN_TOTAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    if (!isVisible || lockExpiresAt <= 0) {
      setRemainingSeconds(COUNTDOWN_TOTAL);
      return;
    }

    const computeRemaining = () =>
      Math.max(0, Math.round((lockExpiresAt - Date.now()) / 1000));

    setRemainingSeconds(computeRemaining());

    intervalRef.current = setInterval(() => {
      const secs = computeRemaining();
      setRemainingSeconds(secs);

      if (secs <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        unlockSlot(date, slotTime, courtId).catch(() => {});
        Alert.alert(
          'Süre Doldu',
          'Rezervasyon kilidi kaldırıldı. Lütfen tekrar deneyin.',
          [{ text: 'Tamam', onPress: () => onCancelRef.current() }],
        );
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isVisible, lockExpiresAt, date, slotTime, courtId]);

  const isUrgent = remainingSeconds <= 60 && remainingSeconds > 0;
  const [expiry, setExpiry] = useState('12/30');
  const [cvv, setCvv] = useState('123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isBusy = isSubmitting || isCancelling;

  const handleCompletePayment = useCallback(async () => {
    if (isBusy) return;

    setIsSubmitting(true);

    try {
      await confirmSlot(
        date,
        slotTime,
        uid,
        courtId,
        `mock-payment-${Date.now()}`,
      );
      onSuccess();
    } catch (error) {
      console.error('[MockPaymentScreen] confirmSlot failed:', error);
      Alert.alert(
        'Ödeme Hatası',
        'Test ödemesi tamamlanamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isBusy, date, slotTime, uid, courtId, onSuccess]);

  const handleCancel = useCallback(async () => {
    if (isBusy) return;

    setIsCancelling(true);

    try {
      await unlockSlot(date, slotTime, courtId);
    } catch (error) {
      console.error('[MockPaymentScreen] unlockSlot failed:', error);
    } finally {
      setIsCancelling(false);
      onCancel();
    }
  }, [isBusy, date, slotTime, courtId, onCancel]);

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={S.safeArea}>
        <ScrollView
          contentContainerStyle={S.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={S.banner}>
            <Text style={S.bannerTitle}>MOCK TEST MODE</Text>
            <Text style={S.bannerText}>Gerçek Kart Girmeyiniz</Text>
          </View>

          {/* ── Countdown timer ───────────────────────────── */}
          <View style={[S.timerBanner, isUrgent && S.timerBannerUrgent]}>
            <Text style={[S.timerLabel, isUrgent && S.timerLabelUrgent]}>
              ⏳ Slot kilidinin kalan süresi
            </Text>
            <Text style={[S.timerValue, isUrgent && S.timerValueUrgent]}>
              {formatCountdown(remainingSeconds)}
            </Text>
          </View>

          <View style={S.cardPreview}>
            <Text style={S.cardLabel}>Test Kartı</Text>
            <Text style={S.cardNumberPreview}>
              {cardNumber || '•••• •••• •••• ••••'}
            </Text>
            <View style={S.cardFooter}>
              <Text style={S.cardMeta}>{expiry || 'AA/YY'}</Text>
              <Text style={S.cardMeta}>CVV {cvv || '•••'}</Text>
            </View>
          </View>

          <Text style={S.sectionTitle}>Kart Bilgileri</Text>

          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>Kart Numarası</Text>
            <TextInput
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor={c.text.muted}
              keyboardType="number-pad"
              style={S.input}
              editable={!isBusy}
            />
          </View>

          <View style={S.row}>
            <View style={[S.fieldGroup, S.halfField]}>
              <Text style={S.fieldLabel}>Son Kullanma</Text>
              <TextInput
                value={expiry}
                onChangeText={setExpiry}
                placeholder="AA/YY"
                placeholderTextColor={c.text.muted}
                keyboardType="number-pad"
                style={S.input}
                editable={!isBusy}
              />
            </View>

            <View style={[S.fieldGroup, S.halfField]}>
              <Text style={S.fieldLabel}>CVV</Text>
              <TextInput
                value={cvv}
                onChangeText={setCvv}
                placeholder="123"
                placeholderTextColor={c.text.muted}
                keyboardType="number-pad"
                secureTextEntry
                style={S.input}
                editable={!isBusy}
              />
            </View>
          </View>

          <View style={S.summaryCard}>
            <Text style={S.summaryLabel}>Rezervasyon</Text>
            <Text style={S.summaryFacility}>{courtName}</Text>
            <Text style={S.summaryMeta}>
              {date} · {slotTime}
            </Text>
            <Text style={S.summaryPrice}>{price.toLocaleString('tr-TR')} TL</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isBusy}
            onPress={handleCompletePayment}
            style={[S.submitButton, isBusy && S.submitButtonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={c.text.inverse} />
            ) : (
              <Text style={S.submitButtonText}>Test Ödemesini Tamamla</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isBusy}
            onPress={handleCancel}
            style={S.cancelButton}
          >
            {isCancelling ? (
              <ActivityIndicator color={c.status.danger} />
            ) : (
              <Text style={S.cancelButtonText}>Vazgeç / Kapat</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
