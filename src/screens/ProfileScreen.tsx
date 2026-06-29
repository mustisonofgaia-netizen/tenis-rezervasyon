/**
 * ProfileScreen — Player Showcase
 *
 * Sections (top → bottom):
 *  1. Cover banner + absolute settings gear
 *  2. Avatar (overlaps banner) + Name + Rank pill + Profile-completion CTA
 *  3. Stats Board   — elevated card, 3 columns (ELO · Win % · Matches)
 *  4. Achievements  — horizontal chip scroll
 *  5. Recent Matches — outlined card feed
 *  6. Management Hub — coach / court_manager action rows (conditional)
 *  7. Organizer CTA  — prominent banner (conditional)
 *
 * Email / Phone / Logout have been moved to the upcoming Settings screen.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { User } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import { useTournaments } from '../hooks/useTournaments';
import { db } from '../services/firebase';
import { avatarColor } from '../services/userService';
import type { RootTabParamList } from '../navigation/types';
import type { UserStats } from '../types/user';
import { DEFAULT_USER_STATS } from '../types/user';
import { Screen, Card, Typography } from '../components/UI';
import { fontWeights } from '../theme';
import type { ColorTokens } from '../theme/tokens';

// ─── Mock / scaffold data ──────────────────────────────────────────────────────
// Used as fallback display values until real Firestore data is available.

const MOCK_STATS = { elo: 1500, winRate: '68%', matches: 42 } as const;

type RecentMatch = {
  id:       number;
  opponent: string;
  result:   'W' | 'L';
  score:    string;
  date:     string;
};

const MOCK_RECENT_MATCHES: RecentMatch[] = [
  { id: 1, opponent: 'Ali K.', result: 'W', score: '6-4, 6-2', date: '2 gün önce'   },
  { id: 2, opponent: 'Can B.', result: 'L', score: '4-6, 5-7', date: '1 hafta önce' },
];

const MOCK_ACHIEVEMENTS = ['🔥 5 Win Streak', '🏆 First Tournament', '⚡ Fast Server'] as const;

// ─── Layout constants ──────────────────────────────────────────────────────────

const COVER_HEIGHT  = 70;
const AVATAR_SIZE   = 100;
const AVATAR_BORDER = 4; // white ring separating avatar from cover

// ─── Rank helpers ──────────────────────────────────────────────────────────────
// Gamification tier colors are intentional semantic constants, not theme tokens.

type RankInfo = { label: string; emoji: string; color: string; bgColor: string; border: string };

function getRankInfo(elo: number): RankInfo {
  if (elo < 1400) return { label: 'Bronz Oyuncu', emoji: '🥉', color: '#92400E', bgColor: '#FEF3C7', border: '#FDE68A' };
  if (elo <= 1600) return { label: 'Gümüş Oyuncu', emoji: '🥈', color: '#374151', bgColor: '#F3F4F6', border: '#D1D5DB' };
  return              { label: 'Altın Oyuncu',  emoji: '🥇', color: '#78350F', bgColor: '#FFF7ED', border: '#FED7AA' };
}

function formatDisplayName(first: string, last: string): string | null {
  const full = `${first.trim()} ${last.trim()}`.trim();
  return full.length > 0 ? full : null;
}

function buildInitials(first: string, last: string): string | null {
  const f = first.trim();
  const l = last.trim();
  if (!f || !l) return null;
  return `${f[0]}${l[0]}`.toUpperCase();
}

// ─── Role accent palette ───────────────────────────────────────────────────────
// coach = blue · court_manager = emerald
// Organizer gets a dedicated bottom CTA; no row here.

type RoleAccentScheme = { light: string; dark: string };
type RoleAccent = { color: string; iconBg: RoleAccentScheme; rowBg: RoleAccentScheme; border: string };

const ROLE_ACCENTS: Readonly<Record<'coach' | 'courtManager', RoleAccent>> = {
  coach: {
    color:  '#2563EB',
    iconBg: { light: '#DBEAFE', dark: 'rgba(96,165,250,0.15)' },
    rowBg:  { light: '#EFF6FF', dark: 'rgba(96,165,250,0.07)' },
    border: '#3B82F6',
  },
  courtManager: {
    color:  '#059669',
    iconBg: { light: '#D1FAE5', dark: 'rgba(52,211,153,0.15)' },
    rowBg:  { light: '#F0FDF4', dark: 'rgba(52,211,153,0.07)' },
    border: '#10B981',
  },
};

// ─── Theme-aware style factory ────────────────────────────────────────────────
// Purely structural — no hardcoded colours. All colours are injected via inline
// styles from the theme above; this factory exists solely to keep all
// StyleSheet.create calls inside the component lifecycle per architecture rules.

function makeStyles(_c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({

    scrollSection: {
      flex: 1,
    },

    coverBanner: {
      overflow: 'hidden',
    },
    settingsBtn: {
      position: 'absolute',
      zIndex:   10,
    },
    settingsIconBg: {
      width:          40,
      height:         40,
      borderRadius:   12,
      alignItems:     'center',
      justifyContent: 'center',
    },

    avatarCircle: {
      width:          AVATAR_SIZE,
      height:         AVATAR_SIZE,
      borderRadius:   AVATAR_SIZE / 2,
      alignItems:     'center',
      justifyContent: 'center',
    },

    rankPill: {
      flexDirection: 'row',
      alignItems:    'center',
      borderRadius:  20,
      borderWidth:   1,
    },

    ctaButton: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'center',
      borderRadius:   14,
    },

    statRow: {
      flexDirection: 'row',
      overflow:      'hidden',
    },
    statCell: {
      flex:           1,
      alignItems:     'center',
      justifyContent: 'center',
    },
    statCellDividers: {
      borderLeftWidth:  StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    statLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontWeight:    fontWeights.semibold,
      marginTop:     2,
    },

    matchRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
    },
    resultBadge: {
      paddingHorizontal: 10,
      paddingVertical:   4,
      borderRadius:      8,
      alignItems:        'center',
      justifyContent:    'center',
    },

    sectionLabel: {
      textTransform: 'uppercase',
      letterSpacing: 0.9,
      fontWeight:    fontWeights.bold,
    },
    mgmtRow: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'space-between',
      borderLeftWidth: 3,
    },
    mgmtTitle: {
      fontWeight:    fontWeights.bold,
      letterSpacing: -0.1,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems:    'center',
    },
    iconWrapper34: {
      width:          34,
      height:         34,
      borderRadius:   10,
      alignItems:     'center',
      justifyContent: 'center',
    },

    ctaBannerRow: {
      flexDirection: 'row',
      alignItems:    'center',
    },
    ctaIconCircle: {
      width:          52,
      height:         52,
      borderRadius:   26,
      alignItems:     'center',
      justifyContent: 'center',
    },
  });
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const { uid, hasRole } = useAuth();
  const { myTournaments } = useTournaments(uid);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const { profile, requireVerification } = useVerificationGuard();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const isDark     = theme.colorScheme === 'dark';
  const colorScheme = theme.colorScheme;
  const sp     = theme.spacing;
  const c      = theme.colors;
  const S      = useMemo(() => makeStyles(c, isDark), [theme, colorScheme]);

  const displayName = formatDisplayName(profile.firstName, profile.lastName);
  const initials    = buildInitials(profile.firstName, profile.lastName);
  const avatarBg    = avatarColor(uid);

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

  // Display values — real Firestore data where populated, mock fallback otherwise
  const displayElo     = stats.eloRating;
  const displayWinRate =
    stats.matchesPlayed > 0
      ? `${Math.round((stats.wins / stats.matchesPlayed) * 100)}%`
      : MOCK_STATS.winRate;
  const displayMatches = stats.matchesPlayed > 0 ? stats.matchesPlayed : MOCK_STATS.matches;

  const hasCoachOrManager = hasRole('coach') || hasRole('court_manager');

  const handleCompleteProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    requireVerification(() => {});
  }, [requireVerification]);

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

  // ── Derived theme values ────────────────────────────────────────────────────

  // Cover banner: dark slate in light mode (provides contrast for white gear icon);
  // slightly raised surface in dark mode (subtle distinction from screen bg).
  const bannerBg          = isDark ? c.surface.raised : c.text.primary;
  const settingsIconColor = isDark ? c.text.muted     : '#FFFFFF';

  // Complete-profile CTA adapts to scheme: lime accent in dark, slate in light.
  const ctaBgColor = isDark ? c.accent.primary : c.text.primary;

  // Match result badge backgrounds: low-opacity tint of the status color.
  const successBadgeBg = isDark ? 'rgba(34,197,94,0.15)'  : 'rgba(22,163,74,0.10)';
  const dangerBadgeBg  = isDark ? 'rgba(239,68,68,0.15)'  : 'rgba(220,38,38,0.10)';

  // Helper to reduce repetition in entering animations
  const anim = (delay: number) =>
    FadeInDown.delay(delay).duration(420).easing(Easing.out(Easing.cubic));

  return (
    <Screen
      edges={['bottom', 'left', 'right']}
      style={{ backgroundColor: c.background.secondary }}
    >

      {/* ══ FIXED TOP SECTION ══════════════════════════════════════════════════
          Banner · Settings gear · Avatar · Name · Rank · CTA.
          Never scrolls. Screen omits the 'top' edge so the banner bleeds behind
          the status bar for a full-bleed look; insets.top is used manually
          inside to position tappable elements below the status bar text.
          ═══════════════════════════════════════════════════════════════════════ */}
      <View>

        {/* Cover banner — extra height absorbs the status-bar area */}
        <View
          style={[
            S.coverBanner,
            { backgroundColor: c.background.secondary, height: COVER_HEIGHT + insets.top },
          ]}
        >
          {/* Settings gear — lives in a plain View, no animation wrapper, fully tappable */}
          <TouchableOpacity
            style={[S.settingsBtn, { top: insets.top + sp.sm, right: sp.md }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Settings' as never)}
          >
            <View style={[S.settingsIconBg, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name="settings-outline" size={20} color={settingsIconColor} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Identity — avatar overlaps the bottom edge of the banner */}
        <Animated.View
          entering={anim(60)}
          style={{
            alignItems:        'center',
            marginTop:         -(AVATAR_SIZE / 2),
            paddingHorizontal: sp.lg,
            paddingBottom:     sp.lg,
          }}
        >
          {/* Avatar — border ring creates visual separation from banner */}
          <View
            style={[
              S.avatarCircle,
              {
                backgroundColor: avatarBg,
                borderWidth:     AVATAR_BORDER,
                borderColor:     c.background.primary,
                marginBottom:    sp.sm,
                shadowColor:     '#000000',
                shadowOffset:    { width: 0, height: 6 },
                shadowOpacity:   isDark ? 0.40 : 0.16,
                shadowRadius:    18,
                elevation:       6,
              },
            ]}
          >
            {initials ? (
              // White text on any saturated avatar color — intentional.
              <Typography variant="h1" style={{ color: '#FFFFFF', fontSize: 36 }}>
                {initials}
              </Typography>
            ) : (
              <User size={40} color="#FFFFFF" strokeWidth={2.2} />
            )}
          </View>

          {/* Player name */}
          <Typography
            variant="h2"
            color="primary"
            style={{ textAlign: 'center', marginBottom: sp.xs, fontWeight: fontWeights.extrabold }}
          >
            {displayName ?? 'Oyuncu'}
          </Typography>

          {/* Rank pill */}
          <View
            style={[
              S.rankPill,
              {
                backgroundColor:   rank.bgColor,
                borderColor:       rank.border,
                paddingHorizontal: sp.md,
                paddingVertical:   sp.xs,
              },
            ]}
          >
            <Typography
              variant="caption"
              style={{ color: rank.color, fontWeight: fontWeights.semibold, letterSpacing: 0.3 }}
            >
              {rank.emoji}{'  '}{rank.label}
            </Typography>
          </View>

          {/* Complete profile CTA — only shown when profile is unverified */}
          {!profile.isVerified && (
            <TouchableOpacity
              style={[
                S.ctaButton,
                {
                  backgroundColor:   ctaBgColor,
                  marginTop:         sp.md,
                  paddingVertical:   sp.sm,
                  paddingHorizontal: sp.xl,
                  shadowColor:       ctaBgColor,
                  shadowOffset:      { width: 0, height: 4 },
                  shadowOpacity:     0.24,
                  shadowRadius:      10,
                  elevation:         4,
                },
              ]}
              activeOpacity={0.85}
              onPress={handleCompleteProfile}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={c.text.inverse}
                style={{ marginRight: sp.xs }}
              />
              <Typography
                variant="body"
                color="inverse"
                style={{ fontWeight: fontWeights.semibold }}
              >
                Profili Tamamla
              </Typography>
            </TouchableOpacity>
          )}
        </Animated.View>

      </View>

      {/* ══ SCROLLABLE BOTTOM SECTION ═════════════════════════════════════════
          Stats · Achievements · Recent Matches · Management · Organizer CTA.
          Bounces over the Screen's dark background — zero white-flash risk.
          ═══════════════════════════════════════════════════════════════════════ */}
      <ScrollView
        style={S.scrollSection}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: sp.xxl + sp.xl }}
      >

        {/* ── 3. Stats Board ──────────────────────────────────────────────── */}
        <Animated.View
          entering={anim(120)}
          style={{ paddingHorizontal: sp.lg, marginBottom: sp.lg }}
        >
          <Card variant="elevated" padding="none">
            <View style={S.statRow}>

              <View style={[S.statCell, { paddingVertical: sp.lg }]}>
                <Typography
                  variant="h2"
                  color="primary"
                  style={{ fontWeight: fontWeights.extrabold, letterSpacing: -1 }}
                >
                  {displayElo}
                </Typography>
                <Typography variant="caption" color="muted" style={S.statLabel}>
                  ELO
                </Typography>
              </View>

              <View
                style={[
                  S.statCell,
                  S.statCellDividers,
                  { paddingVertical: sp.lg, borderColor: c.border.default },
                ]}
              >
                <Typography
                  variant="h2"
                  color="primary"
                  style={{ fontWeight: fontWeights.extrabold, letterSpacing: -1 }}
                >
                  {displayWinRate}
                </Typography>
                <Typography variant="caption" color="muted" style={S.statLabel}>
                  GALİBİYET
                </Typography>
              </View>

              <View style={[S.statCell, { paddingVertical: sp.lg }]}>
                <Typography
                  variant="h2"
                  color="primary"
                  style={{ fontWeight: fontWeights.extrabold, letterSpacing: -1 }}
                >
                  {displayMatches}
                </Typography>
                <Typography variant="caption" color="muted" style={S.statLabel}>
                  MAÇLAR
                </Typography>
              </View>

            </View>
          </Card>
        </Animated.View>

        {/* ── 4. Achievements — horizontal chip scroll ─────────────────────── */}
        <Animated.View entering={anim(180)} style={{ marginBottom: sp.lg }}>
          <Typography
            variant="h3"
            color="primary"
            style={{ fontWeight: fontWeights.bold, marginBottom: sp.sm, paddingHorizontal: sp.lg }}
          >
            Başarımlar
          </Typography>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: sp.lg,
              gap:               sp.sm,
              paddingVertical:   sp.xs,
            }}
          >
            {MOCK_ACHIEVEMENTS.map((badge, i) => (
              <Card key={i} variant="outlined" padding="sm">
                <Typography
                  variant="caption"
                  color="primary"
                  style={{ fontWeight: fontWeights.medium }}
                >
                  {badge}
                </Typography>
              </Card>
            ))}
          </ScrollView>
        </Animated.View>

        {/* ── 5. Recent Matches — card feed ───────────────────────────────── */}
        <Animated.View
          entering={anim(240)}
          style={{ paddingHorizontal: sp.lg, marginBottom: sp.lg }}
        >
          <Typography
            variant="h3"
            color="primary"
            style={{ fontWeight: fontWeights.bold, marginBottom: sp.sm }}
          >
            Son Maçlar
          </Typography>

          {MOCK_RECENT_MATCHES.map((match, idx) => (
            <Card
              key={match.id}
              variant="outlined"
              padding="md"
              style={{ marginBottom: idx < MOCK_RECENT_MATCHES.length - 1 ? sp.sm : 0 }}
            >
              <View style={S.matchRow}>
                {/* Left: opponent + date */}
                <View style={{ gap: sp.xs }}>
                  <Typography
                    variant="body"
                    color="primary"
                    style={{ fontWeight: fontWeights.semibold }}
                  >
                    vs {match.opponent}
                  </Typography>
                  <Typography variant="caption" color="muted">
                    {match.date}
                  </Typography>
                </View>

                {/* Right: result badge + score */}
                <View style={{ alignItems: 'flex-end', gap: sp.xs }}>
                  <View
                    style={[
                      S.resultBadge,
                      { backgroundColor: match.result === 'W' ? successBadgeBg : dangerBadgeBg },
                    ]}
                  >
                    <Typography
                      variant="caption"
                      color={match.result === 'W' ? 'success' : 'danger'}
                      style={{ fontWeight: fontWeights.extrabold, letterSpacing: 0.5 }}
                    >
                      {match.result === 'W' ? 'GALİP' : 'MAĞLUP'}
                    </Typography>
                  </View>
                  <Typography variant="caption" color="muted">
                    {match.score}
                  </Typography>
                </View>
              </View>
            </Card>
          ))}
        </Animated.View>

        {/* ── 6. Management Hub (coach / court_manager only) ──────────────── */}
        {hasCoachOrManager && (
          <Animated.View
            entering={anim(300)}
            style={{ paddingHorizontal: sp.lg, marginBottom: sp.lg }}
          >
            <Typography
              variant="caption"
              color="muted"
              style={[S.sectionLabel, { marginBottom: sp.sm }]}
            >
              YÖNETİM
            </Typography>
            <Card variant="outlined" padding="none">

              {hasRole('coach') && (
                <TouchableOpacity
                  style={[
                    S.mgmtRow,
                    {
                      borderLeftColor:   ROLE_ACCENTS.coach.border,
                      backgroundColor:   isDark ? ROLE_ACCENTS.coach.rowBg.dark : ROLE_ACCENTS.coach.rowBg.light,
                      paddingVertical:   sp.md,
                      paddingHorizontal: sp.md,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={handleCoachPanel}
                >
                  <View style={[S.rowLeft, { gap: sp.md2 }]}>
                    <View
                      style={[
                        S.iconWrapper34,
                        { backgroundColor: isDark ? ROLE_ACCENTS.coach.iconBg.dark : ROLE_ACCENTS.coach.iconBg.light },
                      ]}
                    >
                      <Ionicons name="school-outline" size={17} color={ROLE_ACCENTS.coach.color} />
                    </View>
                    <View>
                      <Typography variant="body" color="primary" style={S.mgmtTitle}>
                        Antrenör Paneli
                      </Typography>
                      <Typography variant="caption" color="muted" style={{ marginTop: 1 }}>
                        Özel Dersler
                      </Typography>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={ROLE_ACCENTS.coach.color} />
                </TouchableOpacity>
              )}

              {hasRole('court_manager') && (
                <TouchableOpacity
                  style={[
                    S.mgmtRow,
                    {
                      borderLeftColor:   ROLE_ACCENTS.courtManager.border,
                      backgroundColor:   isDark ? ROLE_ACCENTS.courtManager.rowBg.dark : ROLE_ACCENTS.courtManager.rowBg.light,
                      borderTopWidth:    hasRole('coach') ? StyleSheet.hairlineWidth : 0,
                      borderTopColor:    c.border.default,
                      paddingVertical:   sp.md,
                      paddingHorizontal: sp.md,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={handleCourtManagerPanel}
                >
                  <View style={[S.rowLeft, { gap: sp.md2 }]}>
                    <View
                      style={[
                        S.iconWrapper34,
                        { backgroundColor: isDark ? ROLE_ACCENTS.courtManager.iconBg.dark : ROLE_ACCENTS.courtManager.iconBg.light },
                      ]}
                    >
                      <Ionicons name="grid-outline" size={17} color={ROLE_ACCENTS.courtManager.color} />
                    </View>
                    <View>
                      <Typography variant="body" color="primary" style={S.mgmtTitle}>
                        Tesis Yönetimi
                      </Typography>
                      <Typography variant="caption" color="muted" style={{ marginTop: 1 }}>
                        Kort & Fiyatlandırma
                      </Typography>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={ROLE_ACCENTS.courtManager.color} />
                </TouchableOpacity>
              )}

            </Card>
          </Animated.View>
        )}

        {/* ── 7. Organizer CTA Banner ──────────────────────────────────────── */}
        {(hasRole('organizer') || myTournaments.length > 0) && (
          <Animated.View
            entering={anim(320)}
            style={{ paddingHorizontal: sp.lg }}
          >
            <TouchableOpacity activeOpacity={0.85} onPress={handleOrganizerPanel}>
              {/*
               * Card variant="elevated" gives the drop-shadow frame.
               * style.backgroundColor overrides the surface color with the brand accent.
               * text.inverse resolves correctly in both schemes:
               *   light → white text on green banner
               *   dark  → slate-900 text on lime banner
               */}
              <Card
                variant="elevated"
                padding="lg"
                style={{ backgroundColor: c.accent.primary }}
              >
                <View style={S.ctaBannerRow}>
                  <View style={{ flex: 1 }}>
                    <Typography
                      variant="h3"
                      style={{
                        color:        c.text.inverse,
                        fontWeight:   fontWeights.extrabold,
                        marginBottom: sp.xs,
                      }}
                    >
                      Organizatör Paneli
                    </Typography>
                    <Typography
                      variant="body"
                      style={{ color: c.text.inverse, opacity: 0.85 }}
                    >
                      Turnuvalarını yönet, sahaya in.
                    </Typography>
                  </View>
                  <View
                    style={[
                      S.ctaIconCircle,
                      { marginLeft: sp.md, backgroundColor: 'rgba(0,0,0,0.15)' },
                    ]}
                  >
                    <Ionicons name="trophy" size={26} color={c.text.inverse} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          </Animated.View>
        )}

      </ScrollView>

    </Screen>
  );
}

