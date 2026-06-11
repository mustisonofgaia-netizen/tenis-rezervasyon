import { Ionicons } from '@expo/vector-icons';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { auth, db } from '../services/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const PILL_SPRING = { mass: 0.3, damping: 15, stiffness: 150 } as const;

// ─── Error code → Turkish message ─────────────────────────────────────────────

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'Bu e-posta ile kayıtlı hesap bulunamadı.',
  'auth/wrong-password': 'Şifre hatalı. Lütfen tekrar deneyin.',
  'auth/invalid-email': 'Geçerli bir e-posta adresi girin.',
  'auth/email-already-in-use': 'Bu e-posta adresi zaten kayıtlı.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
  'auth/too-many-requests': 'Çok fazla deneme. Lütfen sonra tekrar deneyin.',
  'auth/network-request-failed': 'Ağ bağlantısı hatası. İnternetinizi kontrol edin.',
};

function authErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    return AUTH_ERRORS[err.code] ?? 'Bir hata oluştu. Lütfen tekrar deneyin.';
  }
  return 'Beklenmeyen bir hata oluştu.';
}

// ─── Component ────────────────────────────────────────────────────────────────

type Mode = 'login' | 'register';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Pill animation ──────────────────────────────────────────────────────────
  // tabBarWidth is measured from the toggle container via onLayout.
  // The pill slides between x=0 (login) and x=(containerWidth-8)/2 (register).
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const pillX = useSharedValue(0);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withSpring(pillX.value, PILL_SPRING) }],
  }));

  // ── Mode switch ─────────────────────────────────────────────────────────────

  const switchMode = (next: Mode) => {
    setMode(next);
    pillX.value = next === 'login' ? 0 : (tabBarWidth - 8) / 2;
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (isLoading) return;

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      Alert.alert('Eksik Bilgi', 'E-posta ve şifre alanlarını doldurun.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        Alert.alert('Zayıf Şifre', 'Şifre en az 6 karakter olmalıdır.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Şifre Uyuşmuyor', 'Girdiğiniz şifreler eşleşmiyor.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        const { user } = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password,
        );
        await setDoc(doc(db, 'users', user.uid), {
          email: trimmedEmail,
          role: 'CUSTOMER',
          createdAt: serverTimestamp(),
        });
      }
      // onAuthStateChanged in App.tsx takes over from here
    } catch (err) {
      Alert.alert(
        mode === 'login' ? 'Giriş Hatası' : 'Kayıt Hatası',
        authErrorMessage(err),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google placeholder ──────────────────────────────────────────────────────

  const handleGoogleSignIn = () => {
    // TODO: integrate @react-native-google-signin/google-signin
    Alert.alert('Yakında', 'Google ile giriş çok yakında kullanıma girecek.');
  };

  const isLogin = mode === 'login';
  const pillWidth = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Branding ─────────────────────────────────────── */}
        <View style={styles.brandSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🎾</Text>
          </View>
          <Text style={styles.appName}>Kortum</Text>
          <Text style={styles.appSubtitle}>Tenis Rezervasyon</Text>
        </View>

        {/* ── Animated pill toggle ──────────────────────────── */}
        <View
          style={styles.toggleRow}
          onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
        >
          {/* Sliding background pill */}
          {pillWidth > 0 && (
            <Animated.View
              style={[styles.togglePill, { width: pillWidth }, pillAnimStyle]}
            />
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => switchMode('login')}
            style={styles.toggleButton}
          >
            <Text style={[styles.toggleLabel, isLogin && styles.toggleLabelActive]}>
              Giriş Yap
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => switchMode('register')}
            style={styles.toggleButton}
          >
            <Text style={[styles.toggleLabel, !isLogin && styles.toggleLabelActive]}>
              Kayıt Ol
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Form ─────────────────────────────────────────── */}
        <View style={styles.form}>
          {/* E-posta */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@email.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Şifre */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Şifre</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.inputWithEye}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Şifre Tekrar — animated enter/exit */}
          {!isLogin && (
            <Animated.View
              entering={FadeInDown.duration(300).springify()}
              exiting={FadeOutUp.duration(200)}
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Şifre Tekrar</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.inputWithEye}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirmPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          )}
        </View>

        {/* ── Submit ───────────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={isLoading}
          style={[styles.submitButton, isLoading && styles.submitButtonBusy]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitLabel}>
              {isLogin ? 'Giriş Yap' : 'Hesap Oluştur'}
            </Text>
          )}
        </TouchableOpacity>

        {/* ── Divider ──────────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* ── Google button ─────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleGoogleSignIn}
          style={styles.googleButton}
        >
          <Ionicons
            name="logo-google"
            size={20}
            color="#EA4335"
            style={styles.googleIcon}
          />
          <Text style={styles.googleButtonText}>Google ile Devam Et</Text>
        </TouchableOpacity>

        {/* ── Footer hint ───────────────────────────────────── */}
        <Text style={styles.footerHint}>
          {isLogin ? 'Hesabınız yok mu? ' : 'Zaten hesabınız var mı? '}
          <Text
            style={styles.footerLink}
            onPress={() => switchMode(isLogin ? 'register' : 'login')}
          >
            {isLogin ? 'Kayıt Olun' : 'Giriş Yapın'}
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 48,
  },

  // ── Branding ────────────────────────────────────────────────────────────────
  brandSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  logoEmoji: {
    fontSize: 36,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  appSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: 0.1,
  },

  // ── Mode toggle with sliding pill ───────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 32,
    position: 'relative', // pill is absolutely positioned inside this
  },
  // The sliding pill lives behind the label TouchableOpacities
  togglePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    zIndex: 1, // sit above the pill
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  toggleLabelActive: {
    color: '#0F172A',
  },

  // ── Form ────────────────────────────────────────────────────────────────────
  form: {
    gap: 16,
    marginBottom: 24,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.1,
  },
  // Plain input (e-mail, no eye icon)
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
  // Input row that hosts the eye icon
  inputWrapper: {
    position: 'relative',
  },
  // Input with extra right padding so text never overlaps the eye button
  inputWithEye: {
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingLeft: 16,
    paddingRight: 48,
    fontSize: 16,
    color: '#0F172A',
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Submit ──────────────────────────────────────────────────────────────────
  submitButton: {
    height: 54,
    backgroundColor: '#22C55E',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  submitButtonBusy: {
    opacity: 0.75,
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Divider ─────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#CBD5E1',
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },

  // ── Google button ────────────────────────────────────────────────────────────
  googleButton: {
    height: 54,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.1,
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  footerHint: {
    textAlign: 'center',
    fontSize: 14,
    color: '#94A3B8',
  },
  footerLink: {
    color: '#22C55E',
    fontWeight: '700',
  },
});
