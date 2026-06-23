import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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

import { useTheme } from '../context/ThemeContext';
import { signInWithApple, signInWithGoogle } from '../services/authService';
import { auth, db } from '../services/firebase';
import type { ColorTokens } from '../theme/tokens';

// ─── Error mapping ────────────────────────────────────────────────────────────

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
    flex: { flex: 1, backgroundColor: c.background.secondary },
    container: {
      flexGrow: 1,
      paddingHorizontal: 28,
      paddingTop: 64,
      paddingBottom: 48,
    },

    // ── Branding ────────────────────────────────────────────────────────────────
    brandSection: { alignItems: 'center', marginBottom: 36 },
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
    logoEmoji: { fontSize: 36 },
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
    },

    // ── Social buttons ────────────────────────────────────────────────────────
    // Apple button keeps brand black regardless of theme — required by Apple HIG.
    appleButton: {
      height: 54,
      borderRadius: 16,
      backgroundColor: '#000000',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 4,
    },
    appleButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
      letterSpacing: 0.1,
    },
    googleButton: {
      height: 54,
      borderRadius: 16,
      backgroundColor: c.surface.card,
      borderWidth: 1.5,
      borderColor: c.border.default,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    googleButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text.primary,
    },
    socialIcon: { marginRight: 10 },

    // ── Divider ──────────────────────────────────────────────────────────────────
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border.default,
    },
    dividerText: { fontSize: 13, fontWeight: '500', color: c.text.muted },

    // ── Email toggle ─────────────────────────────────────────────────────────────
    emailToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      borderRadius: 14,
      backgroundColor: c.background.secondary,
      borderWidth: 1.5,
      borderColor: c.border.default,
      marginBottom: 24,
    },
    emailToggleText: { fontSize: 15, fontWeight: '600', color: c.text.muted },

    // ── Mode toggle pill ──────────────────────────────────────────────────────────
    toggleRow: {
      flexDirection: 'row',
      backgroundColor: c.surface.raised,
      borderRadius: 16,
      padding: 4,
      marginBottom: 24,
      position: 'relative',
    },
    togglePill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 13,
      backgroundColor: c.background.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    toggleButton: { flex: 1, paddingVertical: 11, alignItems: 'center', zIndex: 1 },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: c.text.muted },
    toggleLabelActive: { color: c.text.primary },

    // ── Form ─────────────────────────────────────────────────────────────────────
    form: { gap: 16, marginBottom: 20 },
    fieldGroup: { gap: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.text.primary },
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
    inputWrapper: { position: 'relative' },
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

    // ── Submit ────────────────────────────────────────────────────────────────────
    submitButton: {
      height: 54,
      backgroundColor: c.accent.primary,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 6,
    },
    submitButtonBusy: { opacity: 0.75 },
    submitLabel: { fontSize: 17, fontWeight: '700', color: c.text.inverse },

    // ── Footer ────────────────────────────────────────────────────────────────────
    footerHint: {
      textAlign: 'center',
      fontSize: 14,
      color: c.text.muted,
      marginBottom: 20,
    },
    footerLink: { color: c.accent.primary, fontWeight: '700' },

    legalHint: {
      textAlign: 'center',
      fontSize: 11,
      color: c.text.muted,
      lineHeight: 16,
      marginTop: 8,
    },
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { theme, colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  const [mode, setMode]               = useState<Mode>('login');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const [tabBarWidth, setTabBarWidth] = useState(0);
  const pillX = useSharedValue(0);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    pillX.value = withTiming(next === 'login' ? 0 : (tabBarWidth - 8) / 2, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [pillX, tabBarWidth]);

  const handleSocial = useCallback(async (provider: 'apple' | 'google') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSocialLoading(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else await signInWithGoogle();
    } catch (err) {
      Alert.alert('Giriş Hatası', authErrorMessage(err));
    } finally {
      setSocialLoading(null);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        const { user } = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await setDoc(doc(db, 'users', user.uid), {
          email: trimmedEmail,
          role: 'player',
          isVerified: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      Alert.alert(
        mode === 'login' ? 'Giriş Hatası' : 'Kayıt Hatası',
        authErrorMessage(err),
      );
    } finally {
      setIsLoading(false);
    }
  }, [confirmPassword, email, isLoading, mode, password]);

  const isLogin = mode === 'login';
  const pillWidth = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0;

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
        {/* Branding */}
        <View style={S.brandSection}>
          <View style={S.logoCircle}>
            <Text style={S.logoEmoji}>🎾</Text>
          </View>
          <Text style={S.appName}>Kortum</Text>
          <Text style={S.appSubtitle}>Tenis & Padel Marketplace</Text>
        </View>

        {/* Primary: frictionless social entry */}
        <TouchableOpacity
          style={S.appleButton}
          activeOpacity={0.88}
          disabled={!!socialLoading}
          onPress={() => handleSocial('apple')}
        >
          {socialLoading === 'apple' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={22} color="#FFFFFF" style={S.socialIcon} />
              <Text style={S.appleButtonText}>Apple ile Devam Et</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={S.googleButton}
          activeOpacity={0.88}
          disabled={!!socialLoading}
          onPress={() => handleSocial('google')}
        >
          {socialLoading === 'google' ? (
            <ActivityIndicator color={c.text.muted} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#EA4335" style={S.socialIcon} />
              <Text style={S.googleButtonText}>Google ile Devam Et</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={S.dividerRow}>
          <View style={S.dividerLine} />
          <Text style={S.dividerText}>veya</Text>
          <View style={S.dividerLine} />
        </View>

        {/* Secondary: email toggle */}
        {!showEmailForm ? (
          <TouchableOpacity
            style={S.emailToggle}
            activeOpacity={0.75}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setShowEmailForm(true);
            }}
          >
            <Ionicons name="mail-outline" size={18} color={c.text.muted} style={{ marginRight: 8 }} />
            <Text style={S.emailToggleText}>E-posta ile devam et</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View entering={FadeInDown.duration(360).easing(Easing.out(Easing.cubic))}>
            {/* Mode toggle */}
            <View
              style={S.toggleRow}
              onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
            >
              {pillWidth > 0 && (
                <Animated.View
                  style={[S.togglePill, { width: pillWidth }, pillAnimStyle]}
                />
              )}
              <TouchableOpacity activeOpacity={0.8} onPress={() => switchMode('login')} style={S.toggleButton}>
                <Text style={[S.toggleLabel, isLogin && S.toggleLabelActive]}>Giriş Yap</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={() => switchMode('register')} style={S.toggleButton}>
                <Text style={[S.toggleLabel, !isLogin && S.toggleLabelActive]}>Kayıt Ol</Text>
              </TouchableOpacity>
            </View>

            <View style={S.form}>
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

              {!isLogin && (
                <Animated.View
                  entering={FadeInDown.duration(320).easing(Easing.out(Easing.cubic))}
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

            <Text style={S.footerHint}>
              {isLogin ? 'Hesabınız yok mu? ' : 'Zaten hesabınız var mı? '}
              <Text style={S.footerLink} onPress={() => switchMode(isLogin ? 'register' : 'login')}>
                {isLogin ? 'Kayıt Olun' : 'Giriş Yapın'}
              </Text>
            </Text>
          </Animated.View>
        )}

        <Text style={S.legalHint}>
          Devam ederek Kullanım Koşulları ve Gizlilik Politikasını kabul etmiş olursunuz.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
