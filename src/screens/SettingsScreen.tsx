/**
 * SettingsScreen — App preferences, support, and account management.
 *
 * Sections (top → bottom):
 *  1. Header         — "Ayarlar" h1 title
 *  2. TERCİHLER      — Theme toggle, Notifications
 *  3. HAKKINDA       — Contact & Feedback, Privacy Policy
 *  4. HESAP          — Sign Out, Delete Account (danger)
 *
 * Email / Phone / Logout were moved here from ProfileScreen.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { signOut } from 'firebase/auth';
import React, { useCallback } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { auth } from '../services/firebase';
import { Screen, Card, Typography } from '../components/UI';
import { fontWeights } from '../theme';

// ─── Sub-component types ────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type SettingsRowProps = {
  icon:       IoniconName;
  label:      string;
  onPress:    () => void;
  /** Render a hairline divider above this row. */
  divider?:   boolean;
  /** Apply `status.danger` color to icon and label. */
  danger?:    boolean;
  /** Show trailing chevron. Defaults to `true` for normal rows, `false` for danger. */
  chevron?:   boolean;
};

// ─── SettingsRow ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  onPress,
  divider  = false,
  danger   = false,
  chevron,
}: SettingsRowProps) {
  const { theme } = useTheme();
  const isDark = theme.colorScheme === 'dark';
  const sp     = theme.spacing;
  const c      = theme.colors;

  const showChevron = chevron ?? !danger;

  const iconColor = danger ? c.status.danger : c.text.muted;
  const iconBg    = danger
    ? (isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.09)')
    : c.surface.raised;

  return (
    <>
      {divider && (
        <View style={[S.divider, { backgroundColor: c.border.default }]} />
      )}
      <TouchableOpacity
        style={[S.row, { paddingVertical: sp.md, paddingHorizontal: sp.md }]}
        activeOpacity={0.7}
        onPress={onPress}
      >
        <View style={[S.iconWrapper, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>

        <Typography
          variant="body"
          color={danger ? 'danger' : 'primary'}
          style={{ flex: 1, marginLeft: sp.md2 }}
        >
          {label}
        </Typography>

        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={c.border.default} />
        )}
      </TouchableOpacity>
    </>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: string }) {
  const { theme } = useTheme();
  const sp = theme.spacing;

  return (
    <Typography
      variant="caption"
      color="muted"
      style={{
        marginBottom:    sp.xs,
        marginTop:       sp.lg,
        marginHorizontal: sp.xs,
        letterSpacing:   0.8,
        fontWeight:      fontWeights.semibold,
      }}
    >
      {children}
    </Typography>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme.colorScheme === 'dark';
  const sp     = theme.spacing;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggleTheme();
  }, [toggleTheme]);

  const handleNotifications = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Bildirimler', 'Bildirim ayarları yakında aktif edilecek.');
  }, []);

  const handleContact = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('İletişim', 'destek@tenisapp.com adresine ulaşabilirsiniz.');
  }, []);

  const handlePrivacy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Gizlilik Sözleşmesi', 'Gizlilik politikası yakında eklenecek.');
  }, []);

  const handleSignOut = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkmak istediğinize emin misiniz?',
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

  const handleDeleteAccount = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Alert.alert(
      'Hesabımı Sil',
      'Bu işlem geri alınamaz. Tüm verileriniz kalıcı olarak silinir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabı Sil',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Hesap Silme', 'Bu özellik yakında aktif edilecek.'),
        },
      ],
    );
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const themeIcon: IoniconName = isDark ? 'sunny-outline' : 'moon-outline';
  const themeLabel = isDark ? 'Tema: Karanlık Mod' : 'Tema: Aydınlık Mod';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen
      scrollable
      edges={['top', 'bottom', 'left', 'right']}
      contentContainerStyle={{
        paddingHorizontal: sp.lg,
        paddingBottom:     sp.xxl + sp.xl,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Typography
        variant="h1"
        color="primary"
        style={{
          marginTop:    sp.xl,
          marginBottom: sp.xs,
          fontWeight:   fontWeights.extrabold,
        }}
      >
        Ayarlar
      </Typography>

      {/* ── Section 1: Preferences ─────────────────────────────────────── */}
      <SectionHeader>TERCİHLER</SectionHeader>
      <Card variant="flat" padding="none" style={S.sectionCard}>
        <SettingsRow
          icon={themeIcon}
          label={themeLabel}
          onPress={handleToggleTheme}
          chevron={false}
        />
        <SettingsRow
          icon="notifications-outline"
          label="Bildirimler"
          onPress={handleNotifications}
          divider
        />
      </Card>

      {/* ── Section 2: Support & Legal ─────────────────────────────────── */}
      <SectionHeader>HAKKINDA</SectionHeader>
      <Card variant="flat" padding="none" style={S.sectionCard}>
        <SettingsRow
          icon="mail-outline"
          label="İletişim ve Geri Bildirim"
          onPress={handleContact}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Gizlilik Sözleşmesi"
          onPress={handlePrivacy}
          divider
        />
      </Card>

      {/* ── Section 3: Account ─────────────────────────────────────────── */}
      <SectionHeader>HESAP</SectionHeader>
      <Card variant="flat" padding="none" style={S.sectionCard}>
        <SettingsRow
          icon="log-out-outline"
          label="Çıkış Yap"
          onPress={handleSignOut}
          chevron={false}
        />
        <SettingsRow
          icon="trash-outline"
          label="Hesabımı Sil"
          onPress={handleDeleteAccount}
          divider
          danger
        />
      </Card>
    </Screen>
  );
}

// ─── Static styles ────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  iconWrapper: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
  },
  divider: {
    height:           StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  sectionCard: {
    borderRadius: 14,
    overflow:     'hidden',
  },
});
