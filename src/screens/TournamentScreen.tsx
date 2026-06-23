import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TournamentStackParamList } from '../navigation/types';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import type {
  ApprovalFlow,
  ApprovalStatus,
  CustomFormat,
  TierPoints,
  TieBreakerConfig,
  TieBreakerPriority,
  Tournament,
  TournamentPlayer,
  TournamentTab,
} from '../services/tournamentService';
import {
  fetchActiveTournaments,
  joinTournament,
  seedMockData,
  submitMatchResult,
  subscribeToTournamentLeaderboard,
  triggerStandingsRefresh,
} from '../services/tournamentService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types re-exported from tournamentService (imported above) ────────────────
// TournamentTab, CustomFormat, PowerPointConfig, MatchRule, TieBreakerPriority,
// TieBreakerConfig, ApprovalStatus, ApprovalFlow, Tournament, TournamentPlayer

// ─── Internal UI-only data types ─────────────────────────────────────────────

type CustomLeaderboardEntry = {
  id:     string;
  rank:   number;
  name:   string;
  played: number;
  wins:   number;
  losses: number;
  points: number;
};

// ─── Non-colour layout constants ─────────────────────────────────────────────

const H_PAD  = 20;
const CARD_R = 16;
const TAB_H  = 68;

const TABS: TournamentTab[] = ['Lig', 'Defi', 'Özel'];

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Maps live `TournamentPlayer` records from Firestore into the display shape
 * `CustomLeaderboardEntry` that the leaderboard row component consumes.
 * Rank is derived from the position in the already-sorted array.
 * Player display name falls back to a truncated userId until a separate
 * profile-resolution pass is wired up.
 */
function mapPlayersToLeaderboard(players: TournamentPlayer[]): CustomLeaderboardEntry[] {
  return players.map((p, idx) => ({
    id:     p.userId,
    rank:   idx + 1,
    name:   p.userId.length > 14 ? `${p.userId.substring(0, 14)}…` : p.userId,
    played: p.played,
    wins:   p.wins,
    losses: p.losses,
    points: p.points,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Gold / silver / bronze rank colours — semantic decorative, not brand colours. */
function rankColor(rank: number, muted: string): string {
  if (rank === 1) return '#FBBF24';
  if (rank === 2) return '#94A3B8';
  if (rank === 3) return '#C27938';
  return muted;
}

function tieBreakerLabel(p: TieBreakerPriority): string {
  if (p === 'wins')    return 'Galibiyet';
  if (p === 'winRate') return 'Galibiyet Oranı';
  return 'Oyun Sayısı';
}

function approvalLabel(s: ApprovalStatus): string {
  if (s === 'pending_opponent')  return 'Rakip onayı bekleniyor';
  if (s === 'pending_organizer') return 'Organizatör onayı bekleniyor';
  return 'Onaylandı';
}

function medalEmoji(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

// ─── Loading placeholder ──────────────────────────────────────────────────────

function TabLoadingView() {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <ActivityIndicator size="large" color={c.accent.primary} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: c.text.muted }}>
        Yükleniyor…
      </Text>
    </View>
  );
}

// ─── EmptyView ────────────────────────────────────────────────────────────────

function EmptyView({ message, inline }: { message: string; inline?: boolean }) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[
      { alignItems: 'center', gap: 14 },
      inline
        ? { paddingVertical: 40, paddingHorizontal: 32 }
        : { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
    ]}>
      <Ionicons name="tennisball-outline" size={inline ? 28 : 44} color={c.border.default} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: c.text.muted, textAlign: 'center', lineHeight: 22 }}>
        {message}
      </Text>
    </View>
  );
}

// ─── SegmentedControl ─────────────────────────────────────────────────────────

type SegCtrlProps = {
  tabs: TournamentTab[];
  active: TournamentTab;
  onSelect: (t: TournamentTab) => void;
};

function makeSegStyles(c: ColorTokens) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      backgroundColor: c.surface.card,
      borderRadius: 12,
      padding: 4,
      marginHorizontal: H_PAD,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 9,
    },
    tabOn:    { backgroundColor: c.accent.primary },
    label:    { fontSize: 14, fontWeight: '600', color: c.text.muted, letterSpacing: 0.2 },
    labelOn:  { color: c.text.inverse, fontWeight: '800' },
  });
}

function SegmentedControl({ tabs, active, onSelect }: SegCtrlProps) {
  const { theme } = useTheme();
  const seg = useMemo(() => makeSegStyles(theme.colors), [theme]);
  return (
    <View style={seg.wrap}>
      {tabs.map((tab) => {
        const on = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            activeOpacity={0.8}
            onPress={() => onSelect(tab)}
            style={[seg.tab, on && seg.tabOn]}
          >
            <Text style={[seg.label, on && seg.labelOn]}>{tab}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── TournamentBanner ─────────────────────────────────────────────────────────

type BannerProps = {
  name: string;
  season: string;
  participants: number;
  format: CustomFormat;
  prize: string;
};

function makeBannerStyles(c: ColorTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface.raised,
      borderRadius: CARD_R,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    topRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    name:        { fontSize: 20, fontWeight: '800', color: c.text.primary, letterSpacing: -0.4 },
    season:      { fontSize: 13, fontWeight: '500', color: c.text.muted },
    formatBadge: {
      backgroundColor: c.accent.primary + '1E',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: c.accent.primary + '47',
    },
    formatText:  { fontSize: 12, fontWeight: '700', color: c.accent.primary },
    statsRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 10 },
    stat:        { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    statText:    { fontSize: 12, fontWeight: '500', color: c.text.muted },
    dot:         { width: 1, height: 12, backgroundColor: c.border.default },
  });
}

function TournamentBanner({ name, season, participants, format, prize }: BannerProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ban = useMemo(() => makeBannerStyles(c), [theme]);
  return (
    <View style={ban.card}>
      <View style={ban.topRow}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={ban.name}>{name}</Text>
          <Text style={ban.season}>{season}</Text>
        </View>
        <View style={ban.formatBadge}>
          <Text style={ban.formatText}>{format}</Text>
        </View>
      </View>
      <View style={ban.statsRow}>
        <View style={ban.stat}>
          <Ionicons name="people-outline" size={13} color={c.text.muted} />
          <Text style={ban.statText}>{participants} Oyuncu</Text>
        </View>
        <View style={ban.dot} />
        <View style={ban.stat}>
          <Ionicons name="calendar-outline" size={13} color={c.text.muted} />
          <Text style={ban.statText}>Haz – Tem 2026</Text>
        </View>
        <View style={ban.dot} />
        <View style={ban.stat}>
          <Ionicons name="trophy-outline" size={13} color={c.status.warning} />
          <Text style={[ban.statText, { color: c.status.warning }]}>{prize}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── LigTab ───────────────────────────────────────────────────────────────────

type LigTabProps = {
  bottomPad: number;
  tournaments: Tournament[];
  isLoading: boolean;
};

function makeLigStyles(c: ColorTokens) {
  return StyleSheet.create({
    section:      { gap: 10, paddingHorizontal: H_PAD },
    sectionTitle: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
    tableEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 36,
      gap: 10,
      backgroundColor: c.surface.card,
      borderRadius: CARD_R,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    emptyText: { fontSize: 13, fontWeight: '500', color: c.text.muted },
  });
}

function LigTab({ bottomPad, tournaments, isLoading }: LigTabProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const lig = useMemo(() => makeLigStyles(c), [theme]);

  if (isLoading) return <TabLoadingView />;

  const t = tournaments[0] ?? null;

  if (!t) {
    return (
      <EmptyView message="Şu an bu kategoride aktif bir turnuva bulunmuyor." />
    );
  }

  const bannerSeason = t.status === 'active' ? 'Devam Ediyor · 2026' : 'Yakında · 2026';
  const bannerPrize  = t.entryFee > 0 ? `₺${t.entryFee * 8} Ödül Havuzu` : 'Ücretsiz Katılım';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 24, paddingTop: 20, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: H_PAD }}>
        <TournamentBanner
          name={t.title}
          season={bannerSeason}
          participants={0}
          format={t.format}
          prize={bannerPrize}
        />
      </View>

      <View style={lig.section}>
        <Text style={lig.sectionTitle}>Grup Sıralaması</Text>
        <View style={lig.tableEmpty}>
          <Ionicons name="stats-chart-outline" size={28} color={c.border.default} />
          <Text style={lig.emptyText}>Sıralama verileri henüz oluşmadı</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── DefiTab ──────────────────────────────────────────────────────────────────

type DefiTabProps = { bottomPad: number };

function makeDefiStyles(c: ColorTokens) {
  return StyleSheet.create({
    hintCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: c.accent.primary + '12',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: c.accent.primary + '2E',
    },
    hintText:    { flex: 1, fontSize: 13, fontWeight: '500', color: c.text.muted, lineHeight: 20 },
    hintBold:    { color: c.accent.primary, fontWeight: '700' },
    section:     { gap: 10 },
    sectionTitle: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
    challengeBtn: {
      height: 52,
      backgroundColor: c.accent.primary,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 4,
    },
    challengeBtnText: { fontSize: 15, fontWeight: '800', color: c.text.inverse },
  });
}

function DefiTab({ bottomPad }: DefiTabProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const dfi = useMemo(() => makeDefiStyles(c), [theme]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 20, paddingTop: 20, paddingHorizontal: H_PAD, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Power point rule hint */}
      <View style={dfi.hintCard}>
        <Ionicons name="flash" size={15} color={c.accent.primary} />
        <Text style={dfi.hintText}>
          Defi galibine rakibinin{' '}
          <Text style={dfi.hintBold}>güç puanı</Text>{' '}
          aktarılır. Puanlar haftalık güncellenir.
        </Text>
      </View>

      {/* Active challenges — empty state until real data is wired */}
      <View style={dfi.section}>
        <Text style={dfi.sectionTitle}>Aktif Defi Maçları</Text>
        <EmptyView
          message="Aktif defi maçı bulunmuyor."
          inline
        />
      </View>

      {/* CTA */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={dfi.challengeBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          Alert.alert('Meydan Oku', 'Rakip seçimi özelliği yakında aktif olacak.');
        }}
      >
        <Ionicons name="flash" size={18} color={c.text.inverse} />
        <Text style={dfi.challengeBtnText}>Meydan Oku</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── OrganizerSettingsCard ────────────────────────────────────────────────────

type OrgSettingsProps = {
  format:         CustomFormat;
  tierPoints:     TierPoints;
  tieBreaker:     TieBreakerConfig;
  updateInterval: 'weekly' | 'monthly';
  autoUpdate:     boolean;
  entryFee:       number;
};

function makeOsgStyles(c: ColorTokens) {
  return StyleSheet.create({
    card:     { backgroundColor: c.surface.card, borderRadius: CARD_R, padding: 16, borderWidth: 1, borderColor: c.border.default },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    title:    { fontSize: 11, fontWeight: '800', color: c.text.primary, textTransform: 'uppercase', letterSpacing: 0.7 },
    row:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 11, gap: 12 },
    rDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default },
    rowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 108 },
    rowLabel: { fontSize: 12, fontWeight: '600', color: c.text.muted },
    rowValue: { flex: 1, fontSize: 12, fontWeight: '600', color: c.text.primary, textAlign: 'right', lineHeight: 18 },
  });
}

function OrganizerSettingsCard({
  format,
  tierPoints,
  tieBreaker,
  updateInterval,
  autoUpdate,
  entryFee,
}: OrgSettingsProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const osg = useMemo(() => makeOsgStyles(c), [theme]);

  const tierSummary = `#1: ${tierPoints.rank1}p · #2–5: ${tierPoints.rank2to5}p · #6–10: ${tierPoints.rank6to10}p · Diğer: ${tierPoints.rest}p`;
  const updateLabel = `${updateInterval === 'weekly' ? 'Haftalık' : 'Aylık'} · ${autoUpdate ? 'Otomatik' : 'Manuel'}`;

  const rows: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { label: 'Format',         value: format,                               icon: 'git-branch-outline' },
    { label: 'Sıralama',       value: tieBreaker.map(tieBreakerLabel).join(' > '), icon: 'podium-outline' },
    { label: 'Puan Tablosu',   value: tierSummary,                          icon: 'flash-outline'      },
    { label: 'Güncelleme',     value: updateLabel,                          icon: 'refresh-outline'    },
    { label: 'Katılım Ücreti', value: `₺${entryFee}`,                      icon: 'card-outline'       },
  ];

  return (
    <View style={osg.card}>
      <View style={osg.titleRow}>
        <Ionicons name="settings-outline" size={14} color={c.accent.primary} />
        <Text style={osg.title}>Organizatör Ayarları</Text>
      </View>
      {rows.map((row, idx) => (
        <View key={row.label} style={[osg.row, idx < rows.length - 1 && osg.rDivider]}>
          <View style={osg.rowLeft}>
            <Ionicons name={row.icon} size={12} color={c.text.muted} />
            <Text style={osg.rowLabel}>{row.label}</Text>
          </View>
          <Text style={osg.rowValue} numberOfLines={2}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

type ApprovalCardProps = {
  approvals: ApprovalFlow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

function makeApcStyles(c: ColorTokens) {
  return StyleSheet.create({
    card:        { backgroundColor: c.surface.card, borderRadius: CARD_R, padding: 16, borderWidth: 1, borderColor: c.border.default, gap: 0 },
    headRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    headLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: c.text.muted },
    headTitle:   { fontSize: 11, fontWeight: '800', color: c.text.primary, textTransform: 'uppercase', letterSpacing: 0.7 },
    // amber chip — dark text is needed on warning/amber backgrounds in both modes
    countChip:   { backgroundColor: c.status.warning, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
    countText:   { fontSize: 11, fontWeight: '800', color: '#0f172a' },
    emptyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    emptyText:   { fontSize: 13, fontWeight: '600', color: c.text.muted },
    item:        { paddingVertical: 14, gap: 8 },
    iDivider:    { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default },
    itemTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    matchLabel:  { flex: 1, fontSize: 14, fontWeight: '700', color: c.text.primary },
    scorePill:   { backgroundColor: c.accent.primary + '1A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: c.accent.primary + '38' },
    scorePillText: { fontSize: 12, fontWeight: '700', color: c.accent.primary },
    statusText:  { fontSize: 11, fontWeight: '500', color: c.text.muted },
    btnRow:      { flexDirection: 'row', gap: 8 },
    btn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
    approveBtn:  { backgroundColor: c.accent.primary },
    approveText: { fontSize: 13, fontWeight: '700', color: c.text.inverse },
    rejectBtn:   { backgroundColor: c.status.danger + '1A', borderWidth: 1, borderColor: c.status.danger + '40' },
    rejectText:  { fontSize: 13, fontWeight: '700', color: c.status.danger },
  });
}

function ApprovalCard({ approvals, onApprove, onReject }: ApprovalCardProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const apc = useMemo(() => makeApcStyles(c), [theme]);
  const pending = approvals.filter((a) => a.status !== 'approved');

  return (
    <View style={apc.card}>
      <View style={apc.headRow}>
        <View style={apc.headLeft}>
          <View style={[apc.dot, pending.length > 0 && { backgroundColor: c.status.warning }]} />
          <Text style={apc.headTitle}>Sonuç Onayları</Text>
        </View>
        <View style={[apc.countChip, pending.length === 0 && { backgroundColor: c.status.success + '33' }]}>
          <Text style={[apc.countText, pending.length === 0 && { color: c.status.success }]}>
            {pending.length === 0 ? '✓' : pending.length}
          </Text>
        </View>
      </View>

      {pending.length === 0 ? (
        <View style={apc.emptyRow}>
          <Ionicons name="checkmark-done-circle" size={18} color={c.status.success} />
          <Text style={apc.emptyText}>Bekleyen onay bulunmuyor</Text>
        </View>
      ) : (
        pending.map((a, idx) => (
          <View key={a.id} style={[apc.item, idx < pending.length - 1 && apc.iDivider]}>
            <View style={apc.itemTop}>
              <Text style={apc.matchLabel} numberOfLines={1}>
                {a.player1} <Text style={{ color: c.text.muted, fontWeight: '500' }}>vs</Text> {a.player2}
              </Text>
              <View style={apc.scorePill}>
                <Text style={apc.scorePillText}>{a.score}</Text>
              </View>
            </View>
            <Text style={apc.statusText}>{approvalLabel(a.status)} · {a.submittedBy} girdi</Text>
            <View style={apc.btnRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[apc.btn, apc.approveBtn]}
                onPress={() => onApprove(a.id)}
              >
                <Ionicons name="checkmark" size={13} color={c.text.inverse} />
                <Text style={apc.approveText}>Onayla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[apc.btn, apc.rejectBtn]}
                onPress={() => onReject(a.id)}
              >
                <Ionicons name="close" size={13} color={c.status.danger} />
                <Text style={apc.rejectText}>Reddet</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ─── Leaderboard rows ─────────────────────────────────────────────────────────

function makeLbdStyles(c: ColorTokens, isDark: boolean) {
  return StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.background.secondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border.default,
    },
    row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: c.surface.card },
    rowAlt:   { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : c.background.secondary },
    rowFirst: { backgroundColor: c.accent.primary + '0F' },
    rowLast:  {},
    rDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default },
    rankWrap: { width: 36, alignItems: 'center', justifyContent: 'center' },
    medal:    { fontSize: 16 },
    colRank:  { width: 36, textAlign: 'center' },
    colName:  { flex: 1, marginHorizontal: 4 },
    colNum:   { width: 28, textAlign: 'center' },
    colPts:   { width: 58, textAlign: 'center' },
    cell:     { fontSize: 13, fontWeight: '500', color: c.text.muted },
    nameText: { fontSize: 13, fontWeight: '700', color: c.text.primary },
    ptsText:  { fontWeight: '800', color: c.accent.primary },
  });
}

function LeaderboardHead() {
  const { theme } = useTheme();
  const c = theme.colors;
  const isDark = theme.colorScheme === 'dark';
  const lbd = useMemo(() => makeLbdStyles(c, isDark), [theme]);
  return (
    <View style={lbd.head}>
      <Text style={[lbd.cell, lbd.colRank]}>#</Text>
      <Text style={[lbd.cell, lbd.colName]}>Oyuncu</Text>
      <Text style={[lbd.cell, lbd.colNum]}>O</Text>
      <Text style={[lbd.cell, lbd.colNum]}>G</Text>
      <Text style={[lbd.cell, lbd.colNum]}>M</Text>
      <Text style={[lbd.cell, lbd.colPts]}>🏆 Puan</Text>
    </View>
  );
}

type LeaderboardRowProps = { item: CustomLeaderboardEntry; index: number; isLast: boolean };

function LeaderboardRow({ item, index, isLast }: LeaderboardRowProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isDark = theme.colorScheme === 'dark';
  const lbd = useMemo(() => makeLbdStyles(c, isDark), [theme]);
  const medal = medalEmoji(item.rank);

  return (
    <View style={[
      lbd.row,
      !isLast && lbd.rDivider,
      isLast && lbd.rowLast,
      item.rank === 1 && lbd.rowFirst,
      index % 2 !== 0 && lbd.rowAlt,
    ]}>
      <View style={[lbd.colRank, lbd.rankWrap]}>
        {medal ? (
          <Text style={lbd.medal}>{medal}</Text>
        ) : (
          <Text style={[lbd.cell, { color: rankColor(item.rank, c.text.muted) }]}>{item.rank}</Text>
        )}
      </View>
      <Text style={[lbd.colName, lbd.nameText]} numberOfLines={1}>{item.name}</Text>
      <Text style={[lbd.cell, lbd.colNum]}>{item.played}</Text>
      <Text style={[lbd.cell, lbd.colNum, { color: c.status.success }]}>{item.wins}</Text>
      <Text style={[lbd.cell, lbd.colNum, { color: c.status.danger }]}>{item.losses}</Text>
      <Text style={[lbd.cell, lbd.colPts, lbd.ptsText]}>{item.points}</Text>
    </View>
  );
}

// ─── OzelTab ──────────────────────────────────────────────────────────────────

type OzelTabProps = {
  approvals:         ApprovalFlow[];
  onApprove:         (id: string) => void;
  onReject:          (id: string) => void;
  bottomPad:         number;
  isLoading:         boolean;
  isRegistered:      boolean;
  isOrganizer:       boolean;
  tournament:        Tournament | null;
  leaderboardData:   CustomLeaderboardEntry[];
  onOpenScoreModal:  () => void;
  onRefreshStandings: () => void;
  isRefreshing:      boolean;
};

function makeOztStyles(c: ColorTokens) {
  return StyleSheet.create({
    header:      { gap: 20, paddingHorizontal: H_PAD },
    section:     { gap: 10 },
    sectionTitle: { fontSize: 11, fontWeight: '800', color: c.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
    scoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.accent.primary + '47',
      backgroundColor: c.accent.primary + '12',
    },
    scoreBtnText:   { fontSize: 14, fontWeight: '700', color: c.accent.primary },
    refreshBtn: {
      flexDirection:   'row',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             8,
      height:          42,
      borderRadius:    12,
      borderWidth:     1,
      borderColor:     c.accent.primary + '59',
      backgroundColor: c.accent.primary + '0D',
    },
    refreshBtnPending: { opacity: 0.5 },
    refreshBtnText:    { fontSize: 13, fontWeight: '700', color: c.accent.primary },
    tableTopCap: {
      marginHorizontal: H_PAD,
      backgroundColor: c.surface.card,
      borderTopLeftRadius: CARD_R,
      borderTopRightRadius: CARD_R,
      overflow: 'hidden',
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.border.default,
    },
    rowWrap: {
      marginHorizontal: H_PAD,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
    },
    tableBottomCap: {
      marginHorizontal: H_PAD,
      height: CARD_R,
      backgroundColor: c.surface.card,
      borderBottomLeftRadius: CARD_R,
      borderBottomRightRadius: CARD_R,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border.default,
      marginTop: -StyleSheet.hairlineWidth,
    },
  });
}

function OzelTab({
  approvals, onApprove, onReject, bottomPad, isLoading,
  isRegistered, isOrganizer, tournament, leaderboardData,
  onOpenScoreModal, onRefreshStandings, isRefreshing,
}: OzelTabProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const ozt = useMemo(() => makeOztStyles(c), [theme]);

  if (isLoading) return <TabLoadingView />;

  if (!tournament) {
    return (
      <EmptyView message="Şu an bu kategoride aktif bir turnuva bulunmuyor." />
    );
  }

  const bannerSeason = tournament.status === 'active' ? 'Özel Turnuva · Devam Ediyor' : 'Özel Turnuva · Yakında';
  const bannerPrize  = tournament.entryFee > 0 ? `₺${tournament.entryFee} Katılım` : 'Ücretsiz Katılım';
  const tierPoints = tournament.rules?.tierPoints ?? {
    rank1: 0,
    rank2to5: 0,
    rank6to10: 0,
    rest: 0,
  };
  const tieBreaker = tournament.rules.tieBreaker;

  const ListHeader = (
    <View style={ozt.header}>
      <TournamentBanner
        name={tournament.title}
        season={bannerSeason}
        participants={leaderboardData.length}
        format={tournament.format}
        prize={bannerPrize}
      />

      {isRegistered && (
        <TouchableOpacity
          style={ozt.scoreBtn}
          activeOpacity={0.85}
          onPress={onOpenScoreModal}
        >
          <Ionicons name="tennisball-outline" size={16} color={c.accent.primary} />
          <Text style={ozt.scoreBtnText}>🎾 Skor Gir</Text>
        </TouchableOpacity>
      )}

      {isOrganizer && !tournament.rules.autoUpdate && (
        <TouchableOpacity
          style={[ozt.refreshBtn, isRefreshing && ozt.refreshBtnPending]}
          activeOpacity={0.85}
          disabled={isRefreshing}
          onPress={onRefreshStandings}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={c.accent.primary} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={15} color={c.accent.primary} />
              <Text style={ozt.refreshBtnText}>Puan Güncelle</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={ozt.section}>
        <Text style={ozt.sectionTitle}>Organizatör Ayarları</Text>
        <OrganizerSettingsCard
          format={tournament.format}
          tierPoints={tierPoints}
          tieBreaker={tieBreaker}
          updateInterval={tournament.rules.updateInterval}
          autoUpdate={tournament.rules.autoUpdate}
          entryFee={tournament.entryFee}
        />
      </View>

      <View style={ozt.section}>
        <Text style={ozt.sectionTitle}>Sonuç Onayları</Text>
        <ApprovalCard
          approvals={approvals}
          onApprove={onApprove}
          onReject={onReject}
        />
      </View>

      <View style={ozt.section}>
        <Text style={ozt.sectionTitle}>Sıralama Tablosu</Text>
        <View style={ozt.tableTopCap}>
          <LeaderboardHead />
        </View>
      </View>
    </View>
  );

  const ListFooter = (
    <>
      <View style={ozt.tableBottomCap} />
      <View style={{ height: bottomPad }} />
    </>
  );

  const ListEmpty = (
    <View style={ozt.rowWrap}>
      <EmptyView message="Henüz sıralama oluşmadı." inline />
    </View>
  );

  return (
    <FlatList
      data={leaderboardData}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={ListHeader}
      renderItem={({ item, index }) => (
        <View style={ozt.rowWrap}>
          <LeaderboardRow
            item={item}
            index={index}
            isLast={index === leaderboardData.length - 1}
          />
        </View>
      )}
      ListEmptyComponent={ListEmpty}
      ListFooterComponent={ListFooter}
      extraData={approvals}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: 20 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── SubmitScoreModal ─────────────────────────────────────────────────────────

type SetScore = { myScore: number; oppScore: number };

const MAX_SETS = 5;
const INITIAL_SETS: SetScore[] = [{ myScore: 0, oppScore: 0 }];

type SubmitScoreModalProps = {
  visible: boolean;
  availablePlayers: CustomLeaderboardEntry[];
  isSubmitting: boolean;
  onSubmit: (opponentId: string, scoreStr: string) => void;
  onClose: () => void;
};

function makeSmoStyles(c: ColorTokens, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.60)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.surface.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: H_PAD,
      paddingTop: 14,
      paddingBottom: 40,
      gap: 20,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : c.border.default,
      alignSelf: 'center',
      marginBottom: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text.primary,
      letterSpacing: -0.3,
    },
    section: { gap: 8 },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    pillRow:        { gap: 8, paddingVertical: 2 },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.surface.raised,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    pillActive: {
      backgroundColor: c.accent.primary + '1E',
      borderColor: c.accent.primary + '73',
    },
    pillText:       { fontSize: 13, fontWeight: '600', color: c.text.muted },
    pillTextActive: { color: c.accent.primary, fontWeight: '700' },
    emptyPill:      { fontSize: 13, fontWeight: '500', color: c.text.muted, fontStyle: 'italic' },
    setList: { gap: 8 },
    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.background.primary,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.border.default,
    },
    setLabel: { fontSize: 12, fontWeight: '700', color: c.text.muted, width: 44 },
    stepper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.surface.raised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepVal: {
      fontSize: 17,
      fontWeight: '800',
      color: c.text.primary,
      minWidth: 24,
      textAlign: 'center',
    },
    vsText: { fontSize: 11, fontWeight: '700', color: c.text.muted, letterSpacing: 0.5 },
    setMgmtRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    setMgmtBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.accent.primary + '12',
      borderWidth: 1,
      borderColor: c.accent.primary + '33',
    },
    setMgmtBtnDanger: {
      backgroundColor: c.status.danger + '0F',
      borderColor: c.status.danger + '33',
    },
    setMgmtText:       { fontSize: 12, fontWeight: '700', color: c.accent.primary },
    setMgmtTextDanger: { color: c.status.danger },
    btnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 4,
    },
    cancelBtn: {
      paddingHorizontal: 20,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '600', color: c.text.muted },
    submitBtn: {
      flex: 1,
      height: 50,
      backgroundColor: c.accent.primary,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius: 8,
      elevation: 6,
    },
    submitBtnPending: {
      backgroundColor: c.accent.primary + '73',
      shadowOpacity: 0,
      elevation: 0,
    },
    submitText: { fontSize: 15, fontWeight: '800', color: c.text.inverse },
  });
}

function SubmitScoreModal({
  visible,
  availablePlayers,
  isSubmitting,
  onSubmit,
  onClose,
}: SubmitScoreModalProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isDark = theme.colorScheme === 'dark';
  const smo = useMemo(() => makeSmoStyles(c, isDark), [theme]);

  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [sets, setSets] = useState<SetScore[]>(INITIAL_SETS);

  useEffect(() => {
    if (visible) {
      setSelectedOpponentId('');
      setSets(INITIAL_SETS);
    }
  }, [visible]);

  const updateSet = useCallback((idx: number, field: keyof SetScore, delta: number) => {
    setSets((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, [field]: Math.max(0, Math.min(7, s[field] + delta)) } : s,
      ),
    );
  }, []);

  const addSet = useCallback(() => {
    setSets((prev) => (prev.length < MAX_SETS ? [...prev, { myScore: 0, oppScore: 0 }] : prev));
  }, []);

  const removeLastSet = useCallback(() => {
    setSets((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const handleInternalSubmit = useCallback(() => {
    if (!selectedOpponentId) {
      Alert.alert('Eksik Bilgi', 'Lütfen rakibinizi seçiniz.');
      return;
    }
    const scoreStr = sets.map((s) => `${s.myScore}:${s.oppScore}`).join(', ');
    onSubmit(selectedOpponentId, scoreStr);
  }, [selectedOpponentId, sets, onSubmit]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={smo.root}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={smo.sheet}>
          <View style={smo.handle} />

          <View style={smo.titleRow}>
            <Text style={smo.title}>Skor Gir</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={c.text.muted} />
            </TouchableOpacity>
          </View>

          {/* ── Opponent Picker ─────────────────────────────────────────── */}
          <View style={smo.section}>
            <Text style={smo.label}>Rakip</Text>
            {availablePlayers.length === 0 ? (
              <Text style={smo.emptyPill}>Sıralamada başka oyuncu bulunamadı.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={smo.pillRow}
              >
                {availablePlayers.map((p) => {
                  const active = p.id === selectedOpponentId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[smo.pill, active && smo.pillActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedOpponentId(p.id);
                      }}
                    >
                      <Text style={[smo.pillText, active && smo.pillTextActive]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── Set Stepper Rows ─────────────────────────────────────────── */}
          <View style={smo.section}>
            <Text style={smo.label}>Setler</Text>
            <View style={smo.setList}>
              {sets.map((s, idx) => (
                <View key={idx} style={smo.setRow}>
                  <Text style={smo.setLabel}>{idx + 1}. Set</Text>

                  <View style={smo.stepper}>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'myScore', -1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="remove" size={14} color={c.text.primary} />
                    </TouchableOpacity>
                    <Text style={smo.stepVal}>{s.myScore}</Text>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'myScore', 1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="add" size={14} color={c.text.primary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={smo.vsText}>vs</Text>

                  <View style={smo.stepper}>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'oppScore', -1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="remove" size={14} color={c.text.primary} />
                    </TouchableOpacity>
                    <Text style={smo.stepVal}>{s.oppScore}</Text>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'oppScore', 1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="add" size={14} color={c.text.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <View style={smo.setMgmtRow}>
              {sets.length < MAX_SETS && (
                <TouchableOpacity style={smo.setMgmtBtn} onPress={addSet} activeOpacity={0.75}>
                  <Ionicons name="add" size={13} color={c.accent.primary} />
                  <Text style={smo.setMgmtText}>+ Set Ekle</Text>
                </TouchableOpacity>
              )}
              {sets.length > 1 && (
                <TouchableOpacity
                  style={[smo.setMgmtBtn, smo.setMgmtBtnDanger]}
                  onPress={removeLastSet}
                  activeOpacity={0.75}
                >
                  <Ionicons name="remove" size={13} color={c.status.danger} />
                  <Text style={[smo.setMgmtText, smo.setMgmtTextDanger]}>Son Seti Sil</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Action Buttons ───────────────────────────────────────────── */}
          <View style={smo.btnRow}>
            <TouchableOpacity
              style={smo.cancelBtn}
              activeOpacity={0.7}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={smo.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[smo.submitBtn, isSubmitting && smo.submitBtnPending]}
              activeOpacity={0.85}
              onPress={handleInternalSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={c.text.inverse} />
              ) : (
                <Text style={smo.submitText}>Gönder</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen styles ───────────────────────────────────────────────────────

function makeScrStyles(c: ColorTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: H_PAD,
      paddingTop: 6,
      paddingBottom: 18,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    createBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 3,
    },
    screenTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: c.text.primary,
      letterSpacing: -0.5,
    },
    screenSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.status.success + '1A',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.status.success + '38',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.status.success,
    },
    liveText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.status.success,
    },
    fab: {
      position: 'absolute',
      left: H_PAD,
      right: H_PAD,
    },
    fabBtn: {
      height: 56,
      backgroundColor: c.accent.primary,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.38,
      shadowRadius: 12,
      elevation: 10,
    },
    fabBtnPending: {
      backgroundColor: c.accent.primary + '73',
    },
    fabText: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text.inverse,
      letterSpacing: 0.2,
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function TournamentScreen() {
  const insets     = useSafeAreaInsets();
  const { uid, hasRole } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<TournamentStackParamList>>();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const scr        = useMemo(() => makeScrStyles(c), [theme]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState<TournamentTab>('Lig');
  const [approvals,   setApprovals]   = useState<ApprovalFlow[]>([]);
  const [hasJoined,   setHasJoined]   = useState(false);
  const [joinPending, setJoinPending] = useState(false);

  // ── Score modal state ────────────────────────────────────────────────────────
  const [isScoreModalVisible, setScoreModalVisible] = useState(false);
  const [isSubmittingScore,    setIsSubmittingScore]   = useState(false);
  const [isRefreshingStandings, setRefreshingStandings] = useState(false);

  // ── Firebase state ───────────────────────────────────────────────────────────
  const [activeTournaments,  setActiveTournaments]  = useState<Tournament[]>([]);
  const [isLoading,          setIsLoading]          = useState(false);
  const [leaderboardPlayers, setLeaderboardPlayers] = useState<TournamentPlayer[]>([]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const ozelTournament = activeTab === 'Özel' ? (activeTournaments[0] ?? null) : null;

  const leaderboardData = useMemo<CustomLeaderboardEntry[]>(
    () => mapPlayersToLeaderboard(leaderboardPlayers),
    [leaderboardPlayers],
  );

  const isRegistered = useMemo(
    () => hasJoined || leaderboardPlayers.some((p) => p.userId === uid),
    [hasJoined, leaderboardPlayers, uid],
  );

  // ── Effect: fetch tournaments when active tab changes ────────────────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setActiveTournaments([]);

    fetchActiveTournaments(activeTab)
      .then((data) => {
        if (!cancelled) setActiveTournaments(data);
      })
      .catch((err) => {
        console.error('[TournamentScreen] fetchActiveTournaments:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab]);

  // ── Effect: subscribe to live leaderboard when Özel tab has a tournament ─────
  useEffect(() => {
    if (activeTab !== 'Özel') return;
    const tournament = activeTournaments[0];
    if (!tournament) return;

    const tieBreaker = tournament.rules?.tieBreaker ?? ['wins', 'winRate', 'played'];
    const unsub = subscribeToTournamentLeaderboard(tournament.id, tieBreaker, (players) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLeaderboardPlayers(players);
    });

    return unsub;
  }, [activeTab, activeTournaments]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleTabChange = useCallback((tab: TournamentTab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
    setLeaderboardPlayers([]);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleApprove = useCallback((id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'approved' as ApprovalStatus } : a)),
    );
  }, []);

  const handleReject = useCallback((id: string) => {
    Alert.alert(
      'Sonucu Reddet',
      'Bu sonucu reddetmek istediğinize emin misiniz? İşlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Reddet',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setApprovals((prev) => prev.filter((a) => a.id !== id));
          },
        },
      ],
    );
  }, []);

  const handleSeedLongPress = useCallback(() => {
    Alert.alert('Seeding...', 'Adding mock data');
    seedMockData()
      .then(() => fetchActiveTournaments(activeTab))
      .then((data) => {
        setActiveTournaments(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Başarılı', 'Test verileri eklendi!');
      })
      .catch((err: unknown) => {
        Alert.alert('Hata', err instanceof Error ? err.message : 'Seed başarısız.');
      });
  }, [activeTab]);

  const handleJoin = useCallback(() => {
    const tournament = activeTournaments[0] ?? null;

    if (!tournament) {
      Alert.alert('Hata', 'Aktif bir turnuva bulunamadı.');
      return;
    }

    if (!uid) {
      Alert.alert('Hata', 'Katılmak için giriş yapmanız gerekiyor.');
      return;
    }

    const { title, entryFee } = tournament;

    Alert.alert(
      'Turnuvaya Katıl',
      entryFee > 0
        ? `${title} için katılım ücreti ₺${entryFee}'dir. Devam etmek istiyor musunuz?`
        : `${title} turnuvasına katılmak istiyor musunuz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: entryFee > 0 ? `Öde ve Katıl  ·  ₺${entryFee}` : 'Katıl',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setJoinPending(true);

            try {
              await joinTournament(tournament.id, uid);
              setJoinPending(false);
              setHasJoined(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              Alert.alert(
                '🎾 Başvuru Alındı',
                'Başvurunuz alındı. Organizatör onayı sonrası turnuvaya dahil edileceksiniz.',
              );
            } catch (err) {
              setJoinPending(false);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
              Alert.alert(
                'Katılım Başarısız',
                err instanceof Error ? err.message : 'Bir hata oluştu. Lütfen tekrar deneyin.',
              );
            }
          },
        },
      ],
    );
  }, [activeTournaments, uid]);

  const handleOpenScoreModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScoreModalVisible(true);
  }, []);

  const handleRefreshStandings = useCallback(async () => {
    const tournament = activeTournaments[0] ?? null;
    if (!tournament) return;

    setRefreshingStandings(true);
    try {
      await triggerStandingsRefresh(tournament.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Başarılı', 'Puan tablosu güncellendi.');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Hata', err instanceof Error ? err.message : 'Güncelleme başarısız.');
    } finally {
      setRefreshingStandings(false);
    }
  }, [activeTournaments]);

  const handleSubmitScore = useCallback(async (selectedOpponentId: string, scoreStr: string) => {
    const tournament = activeTournaments[0] ?? null;

    if (!tournament) {
      Alert.alert('Hata', 'Aktif turnuva bulunamadı.');
      return;
    }
    if (!uid) {
      Alert.alert('Hata', 'Giriş yapmanız gerekiyor.');
      return;
    }

    setIsSubmittingScore(true);
    try {
      await submitMatchResult(tournament.id, uid, selectedOpponentId, scoreStr);
      setScoreModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('✅ Skor Gönderildi', 'Sonuç kaydedildi. Rakip veya organizatör onayı bekleniyor.');
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Hata',
        err instanceof Error ? err.message : 'Skor gönderilemedi. Lütfen tekrar deneyin.',
      );
    } finally {
      setIsSubmittingScore(false);
    }
  }, [activeTournaments, uid]);

  const bottomPad = TAB_H + insets.bottom + 100;

  return (
    <View style={[scr.container, { paddingTop: insets.top }]}>

      {/* ── Screen header ──────────────────────────────────────────────── */}
      <View style={scr.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={handleSeedLongPress}
          style={{ gap: 2 }}
        >
          <Text style={scr.screenTitle}>Turnuvalar</Text>
          <Text style={scr.screenSubtitle}>İstanbul Tenis Ligi · 2026</Text>
        </TouchableOpacity>
        <View style={scr.headerRight}>
          <View style={scr.livePill}>
            <View style={scr.liveDot} />
            <Text style={scr.liveText}>Aktif</Text>
          </View>

          {hasRole('organizer') && (
            <TouchableOpacity
              style={scr.createBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('CreateTournament')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="add" size={20} color={c.text.inverse} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Tab selector ───────────────────────────────────────────────── */}
      <View style={{ paddingBottom: 16 }}>
        <SegmentedControl tabs={TABS} active={activeTab} onSelect={handleTabChange} />
      </View>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {activeTab === 'Lig'  && (
          <LigTab
            bottomPad={bottomPad}
            tournaments={activeTournaments}
            isLoading={isLoading}
          />
        )}
        {activeTab === 'Defi' && <DefiTab bottomPad={bottomPad} />}
        {activeTab === 'Özel' && (
          <OzelTab
            approvals={approvals}
            onApprove={handleApprove}
            onReject={handleReject}
            bottomPad={bottomPad}
            isLoading={isLoading}
            isRegistered={isRegistered}
            isOrganizer={hasRole('organizer')}
            tournament={ozelTournament}
            leaderboardData={leaderboardData}
            onOpenScoreModal={handleOpenScoreModal}
            onRefreshStandings={handleRefreshStandings}
            isRefreshing={isRefreshingStandings}
          />
        )}
      </View>

      {/* ── Join FAB — Özel tab only, for non-participants ─────────────── */}
      {activeTab === 'Özel' && !isRegistered && (
        <View style={[scr.fab, { bottom: insets.bottom + TAB_H + 12 }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleJoin}
            disabled={joinPending}
            style={[scr.fabBtn, joinPending && scr.fabBtnPending]}
          >
            {joinPending ? (
              <ActivityIndicator color={c.text.inverse} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={c.text.inverse} />
                <Text style={scr.fabText}>
                  {(ozelTournament?.entryFee ?? 0) > 0
                    ? `Öde ve Katıl  ·  ₺${ozelTournament!.entryFee}`
                    : 'Turnuvaya Katıl'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Submit Score Modal ─────────────────────────────────────────── */}
      <SubmitScoreModal
        visible={isScoreModalVisible}
        availablePlayers={leaderboardData.filter((p) => p.id !== uid)}
        isSubmitting={isSubmittingScore}
        onSubmit={handleSubmitScore}
        onClose={() => setScoreModalVisible(false)}
      />
    </View>
  );
}
