import { useState } from 'react';
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

import { TEMP_USER_ID } from '../config/app';
import { confirmSlot, unlockSlot } from '../services/bookingService';
import type { CourtId } from '../types/booking';

type MockPaymentScreenProps = {
  isVisible: boolean;
  date: string;
  slotTime: string;
  courtId: CourtId;
  courtName: string;
  price: number;
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
  onSuccess,
  onCancel,
}: MockPaymentScreenProps) {
  const [cardNumber, setCardNumber] = useState('5528 7900 0000 0008');
  const [expiry, setExpiry] = useState('12/30');
  const [cvv, setCvv] = useState('123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isBusy = isSubmitting || isCancelling;

  const handleCompletePayment = async () => {
    if (isBusy) {
      return;
    }

    setIsSubmitting(true);

    try {
      await confirmSlot(
        date,
        slotTime,
        TEMP_USER_ID,
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
  };

  const handleCancel = async () => {
    if (isBusy) {
      return;
    }

    setIsCancelling(true);

    try {
      await unlockSlot(date, slotTime, courtId);
    } catch (error) {
      console.error('[MockPaymentScreen] unlockSlot failed:', error);
    } finally {
      setIsCancelling(false);
      onCancel();
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>MOCK TEST MODE</Text>
            <Text style={styles.bannerText}>Gerçek Kart Girmeyiniz</Text>
          </View>

          <View style={styles.cardPreview}>
            <Text style={styles.cardLabel}>Test Kartı</Text>
            <Text style={styles.cardNumberPreview}>
              {cardNumber || '•••• •••• •••• ••••'}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>{expiry || 'AA/YY'}</Text>
              <Text style={styles.cardMeta}>CVV {cvv || '•••'}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Kart Bilgileri</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Kart Numarası</Text>
            <TextInput
              value={cardNumber}
              onChangeText={setCardNumber}
              placeholder="0000 0000 0000 0000"
              keyboardType="number-pad"
              style={styles.input}
              editable={!isBusy}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.halfField]}>
              <Text style={styles.fieldLabel}>Son Kullanma</Text>
              <TextInput
                value={expiry}
                onChangeText={setExpiry}
                placeholder="AA/YY"
                keyboardType="number-pad"
                style={styles.input}
                editable={!isBusy}
              />
            </View>

            <View style={[styles.fieldGroup, styles.halfField]}>
              <Text style={styles.fieldLabel}>CVV</Text>
              <TextInput
                value={cvv}
                onChangeText={setCvv}
                placeholder="123"
                keyboardType="number-pad"
                secureTextEntry
                style={styles.input}
                editable={!isBusy}
              />
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Rezervasyon</Text>
            <Text style={styles.summaryFacility}>{courtName}</Text>
            <Text style={styles.summaryMeta}>
              {date} · {slotTime}
            </Text>
            <Text style={styles.summaryPrice}>{price.toLocaleString('tr-TR')} TL</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isBusy}
            onPress={handleCompletePayment}
            style={[styles.submitButton, isBusy && styles.submitButtonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Test Ödemesini Tamamla</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            disabled={isBusy}
            onPress={handleCancel}
            style={styles.cancelButton}
          >
            {isCancelling ? (
              <ActivityIndicator color="#EF4444" />
            ) : (
              <Text style={styles.cancelButtonText}>Vazgeç / Kapat</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  banner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 24,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B45309',
  },
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginTop: 8,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  summaryFacility: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  summaryMeta: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 10,
  },
  summaryPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: '#22C55E',
  },
  submitButton: {
    backgroundColor: '#22C55E',
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
    color: '#FFFFFF',
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
    color: '#EF4444',
  },
});
