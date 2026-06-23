import { Ionicons } from '@expo/vector-icons';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
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

import { useTheme } from '../context/ThemeContext';
import { auth, db } from '../services/firebase';
import type { ColorTokens } from '../theme/tokens';

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

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: c.background.secondary,
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
      backgroundColor: c.status.success + '1A',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      shadowColor: c.status.success,
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
      color: c.text.primary,
      letterSpacing: -0.8,
      marginBottom: 4,
    },
    appSubtitle: {
      fontSize: 15,
      fontWeight: '500',
      color: c.text.muted,
      letterSpacing: 0.1,
    },

    // ── Mode toggle with sliding pill ───────────────────────────────────────────
    toggleRow: {
      flexDirection: 'row',
      backgroundColor: c.surface.raised,
      borderRadius: 16,
      padding: 4,
      marginBottom: 32,
      position: 'relative',
    },
    togglePill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 13,
      backgroundColor: c.background.primary,
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
      zIndex: 1,
    },
    toggleLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text.muted,
    },
    toggleLabelActive: {
      color: c.text.primary,
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
      color: c.text.primary,
      letterSpacing: 0.1,
    },
    input: {
      height: 52,
      backgroundColor: c.background.secondary,
      borderWidth: 1.5,
      borderColor: c.border.default,
      borderRadius: 14,
      paddingHorizontal: 16,
      fontSize: 16,
      color: c.text.primary,
    },
    inputWrapper: {
      position: 'relative',
    },
    inputWithEye: {
      height: 52,
      backgroundColor: c.background.secondary,
      borderWidth: 1.5,
      borderColor: c.border.default,
      borderRadius: 14,
      paddingLeft: 16,
      paddingRight: 48,
      fontSize: 16,
      color: c.text.primary,
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
      backgroundColor: c.accent.primary,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: c.accent.primary,
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
      color: c.text.inverse,
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
      backgroundColor: c.border.default,
    },
    dividerText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
    },

    // ── Google button ────────────────────────────────────────────────────────────
    googleButton: {
      height: 54,
      backgroundColor: c.surface.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.border.default,
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
      color: c.text.primary,
      letterSpacing: 0.1,
    },

    // ── Footer ──────────────────────────────────────────────────────────────────
    footerHint: {
      textAlign: 'center',
      fontSize: 14,
      color: c.text.muted,
    },
    footerLink: {
      color: c.accent.primary,
      fontWeight: '700',
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Mode = 'login' | 'register';

export function AuthScreen() {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Pill animation ──────────────────────────────────────────────────────────
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
      style={S.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={S.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Branding ─────────────────────────────────── */}
        <View style={S.brandSection}>
          <View style={S.logoCircle}>
            <Text style={S.logoEmoji}>🎾</Text>
          </View>
          <Text style={S.appName}>Kortum</Text>
          <Text style={S.appSubtitle}>Tenis Rezervasyon</Text>
        </View>

        {/* ── Animated pill toggle ──────────────────────────── */}
        <View
          style={S.toggleRow}
          onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
        >
          {pillWidth > 0 && (
            <Animated.View
              style={[S.togglePill, { width: pillWidth }, pillAnimStyle]}
            />
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => switchMode('login')}
            style={S.toggleButton}
          >
            <Text style={[S.toggleLabel, isLogin && S.toggleLabelActive]}>
              Giriş Yap
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => switchMode('register')}
            style={S.toggleButton}
          >
            <Text style={[S.toggleLabel, !isLogin && S.toggleLabelActive]}>
              Kayıt Ol
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Form ─────────────────────────────────────────── */}
        <View style={S.form}>
          {/* E-posta */}
          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>E-posta</Text>
            <TextInput
              style={S.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@email.com"
              placeholderTextColor={c.text.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {/* Şifre */}
          <View style={S.fieldGroup}>
            <Text style={S.fieldLabel}>Şifre</Text>
            <View style={S.inputWrapper}>
              <TextInput
                style={S.inputWithEye}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={c.text.muted}
                secureTextEntry={!showPassword}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={S.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={c.text.muted}
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
              <View style={S.fieldGroup}>
                <Text style={S.fieldLabel}>Şifre Tekrar</Text>
                <View style={S.inputWrapper}>
                  <TextInput
                    style={S.inputWithEye}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="••••••••"
                    placeholderTextColor={c.text.muted}
                    secureTextEntry={!showConfirmPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={S.eyeButton}
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color={c.text.muted}
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
          style={[S.submitButton, isLoading && S.submitButtonBusy]}
        >
          {isLoading ? (
            <ActivityIndicator color={c.text.inverse} />
          ) : (
            <Text style={S.submitLabel}>
              {isLogin ? 'Giriş Yap' : 'Hesap Oluştur'}
            </Text>
          )}
        </TouchableOpacity>

        {/* ── Divider ──────────────────────────────────────── */}
        <View style={S.dividerRow}>
          <View style={S.dividerLine} />
          <Text style={S.dividerText}>veya</Text>
          <View style={S.dividerLine} />
        </View>

        {/* ── Google button ─────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleGoogleSignIn}
          style={S.googleButton}
        >
          <Ionicons
            name="logo-google"
            size={20}
            color="#EA4335"
            style={S.googleIcon}
          />
          <Text style={S.googleButtonText}>Google ile Devam Et</Text>
        </TouchableOpacity>

        {/* ── Footer hint ───────────────────────────────────── */}
        <Text style={S.footerHint}>
          {isLogin ? 'Hesabınız yok mu? ' : 'Zaten hesabınız var mı? '}
          <Text
            style={S.footerLink}
            onPress={() => switchMode(isLogin ? 'register' : 'login')}
          >
            {isLogin ? 'Kayıt Olun' : 'Giriş Yapın'}
          </Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
