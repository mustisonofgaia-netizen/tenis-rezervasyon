import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { signOut } from 'firebase/auth';
import { User } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import { auth, db } from '../services/firebase';
import { avatarColor } from '../services/userService';
import type { RootTabParamList } from '../navigation/types';
import type { UserStats } from '../types/user';
import { DEFAULT_USER_STATS } from '../types/user';

// ─── Shared spacing ───────────────────────────────────────────────────────────

const CARD_RADIUS = 20;
const ROW_GAP     = 24;
const H_PAD       = 24;

// ─── Rank helpers ─────────────────────────────────────────────────────────────

type RankInfo = {
  label:   string;
  emoji:   string;
  color:   string;
  bgColor: string;
  border:  string;
};

function getRankInfo(elo: number): RankInfo {
  if (elo < 1400) {
    return { label: 'Bronz Oyuncu', emoji: '🥉', color: '#92400E', bgColor: '#FEF3C7', border: '#FDE68A' };
  }
  if (elo <= 1600) {
    return { label: 'Gümüş Oyuncu', emoji: '🥈', color: '#374151', bgColor: '#F3F4F6', border: '#D1D5DB' };
  }
  return { label: 'Altın Oyuncu', emoji: '🥇', color: '#78350F', bgColor: '#FFF7ED', border: '#FED7AA' };
}

function formatDisplayName(firstName: string, lastName: string): string | null {
  const full = `${firstName.trim()} ${lastName.trim()}`.trim();
  return full.length > 0 ? full : null;
}

function buildInitials(firstName: string, lastName: string): string | null {
  const first = firstName.trim();
  const last  = lastName.trim();
  if (!first || !last) return null;
  return `${first[0]}${last[0]}`.toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ProfileFieldProps = {
  label: string;
  value: string | null;
  placeholder?: string;
};

function ProfileField({ label, value, placeholder }: ProfileFieldProps) {
  const isEmpty = !value?.trim();
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={isEmpty ? styles.fieldPlaceholder : styles.fieldValue}>
        {isEmpty ? (placeholder ?? '—') : value}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { uid, hasRole } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { profile, requireVerification } = useVerificationGuard();

  const email = auth.currentUser?.email ?? '';
  const hasPasswordProvider =
    auth.currentUser?.providerData.some((p) => p.providerId === 'password') ?? false;

  const displayName = formatDisplayName(profile.firstName, profile.lastName);
  const initials    = buildInitials(profile.firstName, profile.lastName);
  const color       = avatarColor(uid);

  const [stats, setStats] = useState<UserStats>(DEFAULT_USER_STATS);

  useEffect(() => {
    const userRef = doc(db, 'users', uid);
    return onSnapshot(userRef, (snap) => {
      const data = snap.data();
      if (!data) return;
      setStats({
        eloRating:     (data.eloRating     as number | undefined) ?? 1500,
        matchesPlayed: (data.matchesPlayed as number | undefined) ?? 0,
        wins:          (data.wins          as number | undefined) ?? 0,
      });
    });
  }, [uid]);

  const rank = getRankInfo(stats.eloRating);

  const handleCompleteProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    requireVerification(() => {});
  }, [requireVerification]);

  const handleChangePassword = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Şifremi Değiştir', 'Yakında aktif edilecek.');
  }, []);

  const hasManagementRole =
    hasRole('organizer') || hasRole('coach') || hasRole('court_manager');

  const handleOrganizerPanel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('Tournament', { screen: 'OrganizerDashboard' });
  }, [navigation]);

  const handleCoachPanel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert('Antrenör Paneli', 'Özel ders modülü yakında aktif edilecek.');
  }, []);

  const handleCourtManagerPanel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert('Tesis Yönetimi', 'Kort yönetim paneli yakında aktif edilecek.');
  }, []);

  const handleSignOut = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(0).duration(420).easing(Easing.out(Easing.cubic))}>
          <View style={styles.profileCard}>
            {/* Avatar header */}
            <View style={styles.avatarHeader}>
              <View style={[styles.avatarCircle, { backgroundColor: color }]}>
                {initials ? (
                  <Text style={styles.avatarInitial}>{initials}</Text>
                ) : (
                  <User size={40} color="#FFFFFF" strokeWidth={2.2} />
                )}
              </View>
              <View style={[styles.rankBadge, { backgroundColor: rank.bgColor, borderColor: rank.border }]}>
                <Text style={styles.rankEmoji}>{rank.emoji}</Text>
                <Text style={[styles.rankLabel, { color: rank.color }]}>{rank.label}</Text>
              </View>
            </View>

            {/* Label–value fields */}
            <View style={styles.fieldsSection}>
              <ProfileField
                label="Ad Soyad"
                value={displayName}
                placeholder="İsim belirtilmemiş"
              />
              {email ? (
                <ProfileField label="E-posta" value={email} />
              ) : null}
              <ProfileField
                label="Telefon"
                value={profile.phoneNumber.trim() || null}
                placeholder="Telefon eklenmemiş"
              />
            </View>

            {!profile.isVerified && (
              <TouchableOpacity
                style={styles.completeProfileButton}
                activeOpacity={0.85}
                onPress={handleCompleteProfile}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.completeProfileButtonText}>Profili Tamamla</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(100).duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.statsRow}
        >
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.eloRating}</Text>
            <Text style={styles.statLabel}>Elo Puanı</Text>
          </View>
          <View style={[styles.statItem, styles.statItemCenter]}>
            <Text style={styles.statValue}>{stats.wins}</Text>
            <Text style={styles.statLabel}>Galibiyet</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.matchesPlayed}</Text>
            <Text style={styles.statLabel}>Maç</Text>
          </View>
        </Animated.View>

        {hasPasswordProvider && (
          <Animated.View entering={FadeInDown.delay(180).duration(420).easing(Easing.out(Easing.cubic))}>
            <Text style={styles.sectionLabel}>Hesap Ayarları</Text>
            <View style={styles.settingsGroup}>
              <TouchableOpacity
                style={styles.settingsRow}
                activeOpacity={0.7}
                onPress={handleChangePassword}
              >
                <View style={styles.settingsRowLeft}>
                  <View style={styles.settingsIconWrapper}>
                    <Ionicons name="key-outline" size={17} color="#6B7280" />
                  </View>
                  <Text style={styles.settingsRowText}>Şifremi Değiştir</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {hasManagementRole && (
          <Animated.View entering={FadeInDown.delay(240).duration(420).easing(Easing.out(Easing.cubic))}>
            <Text style={styles.sectionLabel}>Yönetim Merkezi</Text>
            <View style={styles.mgmtGroup}>

              {hasRole('organizer') && (
                <TouchableOpacity
                  style={[styles.mgmtRow, styles.mgmtRowOrganizer]}
                  activeOpacity={0.75}
                  onPress={handleOrganizerPanel}
                >
                  <View style={styles.mgmtRowLeft}>
                    <View style={[styles.mgmtIconWrapper, styles.mgmtIconOrganizer]}>
                      <Ionicons name="trophy-outline" size={17} color="#D97706" />
                    </View>
                    <View>
                      <Text style={styles.mgmtRowTitle}>Organizatör Paneli</Text>
                      <Text style={styles.mgmtRowSub}>Turnuva Yönetimi</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D97706" />
                </TouchableOpacity>
              )}

              {hasRole('coach') && (
                <TouchableOpacity
                  style={[styles.mgmtRow, styles.mgmtRowCoach]}
                  activeOpacity={0.75}
                  onPress={handleCoachPanel}
                >
                  <View style={styles.mgmtRowLeft}>
                    <View style={[styles.mgmtIconWrapper, styles.mgmtIconCoach]}>
                      <Ionicons name="school-outline" size={17} color="#2563EB" />
                    </View>
                    <View>
                      <Text style={styles.mgmtRowTitle}>Antrenör Paneli</Text>
                      <Text style={styles.mgmtRowSub}>Özel Dersler</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#2563EB" />
                </TouchableOpacity>
              )}

              {hasRole('court_manager') && (
                <TouchableOpacity
                  style={[styles.mgmtRow, styles.mgmtRowCourtManager]}
                  activeOpacity={0.75}
                  onPress={handleCourtManagerPanel}
                >
                  <View style={styles.mgmtRowLeft}>
                    <View style={[styles.mgmtIconWrapper, styles.mgmtIconCourtManager]}>
                      <Ionicons name="grid-outline" size={17} color="#059669" />
                    </View>
                    <View>
                      <Text style={styles.mgmtRowTitle}>Tesis Yönetimi</Text>
                      <Text style={styles.mgmtRowSub}>Kort & Fiyatlandırma</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#059669" />
                </TouchableOpacity>
              )}

            </View>
          </Animated.View>
        )}

        <Animated.View
          entering={FadeInDown.delay(320).duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.signOutSection}
        >
          <TouchableOpacity
            style={styles.signOutButton}
            activeOpacity={0.8}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.signOutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    paddingHorizontal: H_PAD,
    paddingTop: 32,
    paddingBottom: 120,
  },

  // ── Profile card ──────────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    marginBottom: ROW_GAP,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  avatarHeader: {
    alignItems: 'center',
    marginBottom: ROW_GAP,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 5,
  },
  avatarInitial: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  fieldsSection: {
    gap: ROW_GAP,
    marginBottom: ROW_GAP,
  },
  fieldRow: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  fieldPlaceholder: {
    fontSize: 16,
    fontWeight: '500',
    color: '#CBD5E1',
  },
  completeProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  completeProfileButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Rank badge ────────────────────────────────────────────────────────────
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  rankEmoji: { fontSize: 16 },
  rankLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    marginBottom: 36,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statItemCenter: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    marginBottom: 36,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  // ── Management Hub ────────────────────────────────────────────────────────
  mgmtGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 36,
  },
  mgmtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderLeftWidth: 3,
  },
  mgmtRowOrganizer: {
    borderLeftColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  mgmtRowCoach: {
    borderLeftColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  mgmtRowCourtManager: {
    borderLeftColor: '#10B981',
    backgroundColor: '#F0FDF4',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  mgmtRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mgmtIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mgmtIconOrganizer:    { backgroundColor: '#FEF3C7' },
  mgmtIconCoach:        { backgroundColor: '#DBEAFE' },
  mgmtIconCourtManager: { backgroundColor: '#D1FAE5' },
  mgmtRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.1,
  },
  mgmtRowSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 1,
  },

  signOutSection: { alignItems: 'center' },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 0.2,
  },
});
