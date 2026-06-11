import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { doc, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import Animated, {
  Easing,
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { db } from '../services/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_OTP = '123456';
const STEP_ENTER = FadeInRight.duration(320).easing(Easing.out(Easing.cubic));
const STEP_EXIT  = FadeOutLeft.duration(240).easing(Easing.in(Easing.cubic));

type Step = 1 | 2 | 3;

type CompleteProfileModalProps = {
  isVisible: boolean;
  uid: string;
  onClose: () => void;
  onComplete: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CompleteProfileModal({
  isVisible,
  uid,
  onClose,
  onComplete,
}: CompleteProfileModalProps) {
  const [step, setStep]           = useState<Step>(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [otp, setOtp]             = useState('');
  const [isSaving, setIsSaving]   = useState(false);

  // Reset form when modal opens; dismiss keyboard when it closes
  useEffect(() => {
    if (!isVisible) {
      Keyboard.dismiss();
      return;
    }
    Keyboard.dismiss();
    setStep(1);
    setFirstName('');
    setLastName('');
    setPhone('');
    setOtp('');
    setIsSaving(false);
  }, [isVisible]);

  const handleNextFromName = useCallback(() => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen ad ve soyadınızı girin.');
      return;
    }
    setStep(2);
  }, [firstName, lastName]);

  const handleNextFromPhone = useCallback(() => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Geçersiz Numara', 'Lütfen geçerli bir telefon numarası girin.');
      return;
    }
    setStep(3);
  }, [phone]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.trim() !== MOCK_OTP) {
      Alert.alert('Doğrulama Başarısız', 'Girdiğiniz kod hatalı. Demo kodu: 123456');
      return;
    }

    setIsSaving(true);
    try {
      const fullPhone = `+90${phone.replace(/\D/g, '')}`;
      await setDoc(
        doc(db, 'users', uid),
        {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          phoneNumber: fullPhone,
          isVerified: true,
        },
        { merge: true },
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onComplete();
    } catch {
      Alert.alert('Hata', 'Profil güncellenemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  }, [firstName, lastName, onComplete, otp, phone, uid]);

  const stepLabel = step === 1 ? 'Kimlik' : step === 2 ? 'Telefon' : 'Doğrulama';

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(280)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessible={false}
        >
          <View style={styles.dismissArea} />
        </TouchableWithoutFeedback>

        <Animated.View
          entering={SlideInDown.duration(360).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(260).easing(Easing.in(Easing.cubic))}
          style={styles.sheet}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Profilinizi Tamamlayın</Text>
                <Text style={styles.subtitle}>
                  Rezervasyon ve maç işlemleri için hızlı doğrulama
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  onClose();
                }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close-circle" size={26} color="#D1D5DB" />
              </TouchableOpacity>
            </View>

            {/* Step indicator */}
            <View style={styles.stepRow}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[
                    styles.stepDot,
                    n <= step && styles.stepDotActive,
                    n === step && styles.stepDotCurrent,
                  ]}
                />
              ))}
              <Text style={styles.stepLabel}>{stepLabel} · {step}/3</Text>
            </View>

            {/* Step content — re-mounts on step change for enter/exit animation */}
            <Animated.View key={`step-${step}`} entering={STEP_ENTER} exiting={STEP_EXIT}>
              {step === 1 && (
                <View style={styles.stepBody}>
                  <Text style={styles.fieldLabel}>Ad</Text>
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Adınız"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Soyad</Text>
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Soyadınız"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="words"
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleNextFromName} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>Devam Et</Text>
                  </TouchableOpacity>
                </View>
              )}

              {step === 2 && (
                <View style={styles.stepBody}>
                  <Text style={styles.fieldLabel}>Telefon Numarası</Text>
                  <View style={styles.phoneRow}>
                    <View style={styles.countryCode}>
                      <Text style={styles.countryCodeText}>🇹🇷 +90</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="5XX XXX XX XX"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <Text style={styles.hint}>Size tek seferlik bir doğrulama kodu göndereceğiz.</Text>
                  <View style={styles.navRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
                      <Text style={styles.backBtnText}>Geri</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryBtn, styles.primaryBtnFlex]} onPress={handleNextFromPhone} activeOpacity={0.85}>
                      <Text style={styles.primaryBtnText}>Kod Gönder</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {step === 3 && (
                <View style={styles.stepBody}>
                  <Text style={styles.fieldLabel}>SMS Doğrulama Kodu</Text>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="• • • • • •"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                  <Text style={styles.hint}>Demo kodu: 123456</Text>
                  <View style={styles.navRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)} activeOpacity={0.7}>
                      <Text style={styles.backBtnText}>Geri</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.primaryBtnFlex, isSaving && styles.primaryBtnBusy]}
                      onPress={handleVerifyOtp}
                      disabled={isSaving}
                      activeOpacity={0.85}
                    >
                      {isSaving
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Text style={styles.primaryBtnText}>Doğrula & Devam Et</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 44,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 18,
    maxWidth: 280,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  stepDotActive: { backgroundColor: '#86EFAC' },
  stepDotCurrent: { backgroundColor: '#22C55E', width: 20 },
  stepLabel: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.2,
  },
  stepBody: { gap: 0 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fieldLabelSpaced: { marginTop: 16 },
  input: {
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countryCode: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  phoneInput: {
    flex: 1,
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F172A',
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 17,
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  backBtn: {
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  primaryBtnFlex: { flex: 1, marginTop: 0 },
  primaryBtnBusy: { opacity: 0.75 },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
