import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { auth, db } from '../services/firebase';
import { avatarColor } from '../services/userService';
import type { UserStats } from '../types/user';
import { DEFAULT_USER_STATS } from '../types/user';

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
    return {
      label:   'Bronz Oyuncu',
      emoji:   '🥉',
      color:   '#92400E',
      bgColor: '#FEF3C7',
      border:  '#FDE68A',
    };
  }
  if (elo <= 1600) {
    return {
      label:   'Gümüş Oyuncu',
      emoji:   '🥈',
      color:   '#374151',
      bgColor: '#F3F4F6',
      border:  '#D1D5DB',
    };
  }
  return {
    label:   'Altın Oyuncu',
    emoji:   '🥇',
    color:   '#78350F',
    bgColor: '#FFF7ED',
    border:  '#FED7AA',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local[0] ?? '';
  const dots    = '•'.repeat(Math.max(1, local.length - 1));
  return `${visible}${dots}@${domain}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { uid } = useAuth();

  const email   = auth.currentUser?.email ?? '';
  const initial = email[0]?.toUpperCase() ?? uid[0]?.toUpperCase() ?? '?';
  const color   = avatarColor(uid);

  const [stats, setStats] = useState<UserStats>(DEFAULT_USER_STATS);

  // ── Subscribe to live user stats ──────────────────────────────────────────
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

  const handleChangePassword = useCallback(() => {
    Alert.alert('Şifremi Değiştir', 'Yakında aktif edilecek.');
  }, []);

  const handleSignOut = useCallback(() => {
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
        {/* ── Hero header ─────────────────────────── */}
        <View style={styles.hero}>
          <View style={[styles.avatarCircle, { backgroundColor: color }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.emailText}>{maskEmail(email)}</Text>
          <Text style={styles.uidText} numberOfLines={1}>
            UID: {uid.slice(0, 20)}…
          </Text>

          {/* ── Rank badge ──────────────────────────── */}
          <View style={[styles.rankBadge, { backgroundColor: rank.bgColor, borderColor: rank.border }]}>
            <Text style={styles.rankEmoji}>{rank.emoji}</Text>
            <Text style={[styles.rankLabel, { color: rank.color }]}>{rank.label}</Text>
          </View>
        </View>

        {/* ── Stats row ────────────────────────────── */}
        <View style={styles.statsRow}>
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
        </View>

        {/* ── Settings group ──────────────────────── */}
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

        {/* ── Sign-out ─────────────────────────────── */}
        <View style={styles.signOutSection}>
          <TouchableOpacity
            style={styles.signOutButton}
            activeOpacity={0.8}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.signOutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 120,
  },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    marginBottom: 24,
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
  emailText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  uidText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
    letterSpacing: 0.2,
    marginBottom: 14,
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
  rankEmoji: {
    fontSize: 16,
  },
  rankLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
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

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 10,
    marginLeft: 4,
  },

  // ── Settings group card ───────────────────────────────────────────────────
  settingsGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
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

  // ── Sign-out ──────────────────────────────────────────────────────────────
  signOutSection: {
    alignItems: 'center',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
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
