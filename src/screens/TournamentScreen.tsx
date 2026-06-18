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

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG          = '#0f172a';
const CARD        = '#1e293b';
const CARD_RAISED = '#263352';
const ACTIVE_TAB  = '#bef264';
const ACTIVE_TEXT = '#0f172a';
const TEXT1       = '#f1f5f9';
const TEXT2       = '#94a3b8';
const ACCENT      = '#22c55e';
const RED         = '#ef4444';
const AMBER       = '#f59e0b';
const BORDER      = 'rgba(255,255,255,0.07)';
const H_PAD       = 20;
const CARD_R      = 16;
const TAB_H       = 68;

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

// ─── Loading placeholder ──────────────────────────────────────────────────────

function TabLoadingView() {
  return (
    <View style={load.wrap}>
      <ActivityIndicator size="large" color={ACTIVE_TAB} />
      <Text style={load.text}>Yükleniyor…</Text>
    </View>
  );
}

const load = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  text: { fontSize: 14, fontWeight: '500', color: TEXT2 },
});

// ─── EmptyView ────────────────────────────────────────────────────────────────

/**
 * Generic empty state.
 * `inline={false}` (default) renders flex:1 centred — use as the root of a tab.
 * `inline={true}` renders a fixed-height block — use inside ScrollView / FlatList.
 */
function EmptyView({ message, inline }: { message: string; inline?: boolean }) {
  return (
    <View style={[ev.base, inline ? ev.inline : ev.screen]}>
      <Ionicons name="tennisball-outline" size={inline ? 28 : 44} color={BORDER} />
      <Text style={ev.text}>{message}</Text>
    </View>
  );
}

const ev = StyleSheet.create({
  base:   { alignItems: 'center', gap: 14 },
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  inline: { paddingVertical: 40, paddingHorizontal: 32 },
  text:   { fontSize: 14, fontWeight: '500', color: TEXT2, textAlign: 'center', lineHeight: 22 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function medalEmoji(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function rankColor(rank: number): string {
  if (rank === 1) return '#FBBF24';
  if (rank === 2) return '#94A3B8';
  if (rank === 3) return '#C27938';
  return TEXT2;
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

// ─── SegmentedControl ─────────────────────────────────────────────────────────

type SegCtrlProps = {
  tabs: TournamentTab[];
  active: TournamentTab;
  onSelect: (t: TournamentTab) => void;
};

function SegmentedControl({ tabs, active, onSelect }: SegCtrlProps) {
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

const seg = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: H_PAD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabOn: {
    backgroundColor: ACTIVE_TAB,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT2,
    letterSpacing: 0.2,
  },
  labelOn: {
    color: ACTIVE_TEXT,
    fontWeight: '800',
  },
});

// ─── TournamentBanner ─────────────────────────────────────────────────────────

type BannerProps = {
  name: string;
  season: string;
  participants: number;
  format: CustomFormat;
  prize: string;
};

function TournamentBanner({ name, season, participants, format, prize }: BannerProps) {
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
          <Ionicons name="people-outline" size={13} color={TEXT2} />
          <Text style={ban.statText}>{participants} Oyuncu</Text>
        </View>
        <View style={ban.dot} />
        <View style={ban.stat}>
          <Ionicons name="calendar-outline" size={13} color={TEXT2} />
          <Text style={ban.statText}>Haz – Tem 2026</Text>
        </View>
        <View style={ban.dot} />
        <View style={ban.stat}>
          <Ionicons name="trophy-outline" size={13} color={AMBER} />
          <Text style={[ban.statText, { color: AMBER }]}>{prize}</Text>
        </View>
      </View>
    </View>
  );
}

const ban = StyleSheet.create({
  card: {
    backgroundColor: CARD_RAISED,
    borderRadius: CARD_R,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name:   { fontSize: 20, fontWeight: '800', color: TEXT1, letterSpacing: -0.4 },
  season: { fontSize: 13, fontWeight: '500', color: TEXT2 },
  formatBadge: {
    backgroundColor: 'rgba(190,242,100,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(190,242,100,0.28)',
  },
  formatText: { fontSize: 12, fontWeight: '700', color: ACTIVE_TAB },
  statsRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stat:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText:   { fontSize: 12, fontWeight: '500', color: TEXT2 },
  dot:        { width: 1, height: 12, backgroundColor: BORDER },
});

// ─── LigTab ───────────────────────────────────────────────────────────────────

type LigTabProps = {
  bottomPad: number;
  /** Live tournaments fetched from Firestore for this tab. */
  tournaments: Tournament[];
  isLoading: boolean;
};

function LigTab({ bottomPad, tournaments, isLoading }: LigTabProps) {
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
          <Ionicons name="stats-chart-outline" size={28} color={BORDER} />
          <Text style={lig.emptyText}>Sıralama verileri henüz oluşmadı</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const lig = StyleSheet.create({
  section:      { gap: 10, paddingHorizontal: H_PAD },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: TEXT2, textTransform: 'uppercase', letterSpacing: 1 },
  tableEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
    backgroundColor: CARD,
    borderRadius: CARD_R,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: { fontSize: 13, fontWeight: '500', color: TEXT2 },
});

// ─── DefiTab ──────────────────────────────────────────────────────────────────

type DefiTabProps = { bottomPad: number };

function DefiTab({ bottomPad }: DefiTabProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 20, paddingTop: 20, paddingHorizontal: H_PAD, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Power point rule hint */}
      <View style={dfi.hintCard}>
        <Ionicons name="flash" size={15} color={ACTIVE_TAB} />
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
        <Ionicons name="flash" size={18} color={ACTIVE_TEXT} />
        <Text style={dfi.challengeBtnText}>Meydan Oku</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const dfi = StyleSheet.create({
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(190,242,100,0.07)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(190,242,100,0.18)',
  },
  hintText:    { flex: 1, fontSize: 13, fontWeight: '500', color: TEXT2, lineHeight: 20 },
  hintBold:    { color: ACTIVE_TAB, fontWeight: '700' },
  section:     { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: TEXT2, textTransform: 'uppercase', letterSpacing: 1 },
  challengeBtn: {
    height: 52,
    backgroundColor: ACTIVE_TAB,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  challengeBtnText: { fontSize: 15, fontWeight: '800', color: ACTIVE_TEXT },
});

// ─── OrganizerSettingsCard ────────────────────────────────────────────────────

type OrgSettingsProps = {
  format:         CustomFormat;
  tierPoints:     TierPoints;
  tieBreaker:     TieBreakerConfig;
  updateInterval: 'weekly' | 'monthly';
  autoUpdate:     boolean;
  entryFee:       number;
};

function OrganizerSettingsCard({
  format,
  tierPoints,
  tieBreaker,
  updateInterval,
  autoUpdate,
  entryFee,
}: OrgSettingsProps) {
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
        <Ionicons name="settings-outline" size={14} color={ACTIVE_TAB} />
        <Text style={osg.title}>Organizatör Ayarları</Text>
      </View>
      {rows.map((row, idx) => (
        <View key={row.label} style={[osg.row, idx < rows.length - 1 && osg.rDivider]}>
          <View style={osg.rowLeft}>
            <Ionicons name={row.icon} size={12} color={TEXT2} />
            <Text style={osg.rowLabel}>{row.label}</Text>
          </View>
          <Text style={osg.rowValue} numberOfLines={2}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const osg = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: CARD_R, padding: 16, borderWidth: 1, borderColor: BORDER },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title:    { fontSize: 11, fontWeight: '800', color: TEXT1, textTransform: 'uppercase', letterSpacing: 0.7 },
  row:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 11, gap: 12 },
  rDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  rowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 108 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: TEXT2 },
  rowValue: { flex: 1, fontSize: 12, fontWeight: '600', color: TEXT1, textAlign: 'right', lineHeight: 18 },
});

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

type ApprovalCardProps = {
  approvals: ApprovalFlow[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

function ApprovalCard({ approvals, onApprove, onReject }: ApprovalCardProps) {
  const pending = approvals.filter((a) => a.status !== 'approved');

  return (
    <View style={apc.card}>
      <View style={apc.headRow}>
        <View style={apc.headLeft}>
          <View style={[apc.dot, pending.length > 0 && { backgroundColor: AMBER }]} />
          <Text style={apc.headTitle}>Sonuç Onayları</Text>
        </View>
        <View style={[apc.countChip, pending.length === 0 && { backgroundColor: ACCENT + '33' }]}>
          <Text style={[apc.countText, pending.length === 0 && { color: ACCENT }]}>
            {pending.length === 0 ? '✓' : pending.length}
          </Text>
        </View>
      </View>

      {pending.length === 0 ? (
        <View style={apc.emptyRow}>
          <Ionicons name="checkmark-done-circle" size={18} color={ACCENT} />
          <Text style={apc.emptyText}>Bekleyen onay bulunmuyor</Text>
        </View>
      ) : (
        pending.map((a, idx) => (
          <View key={a.id} style={[apc.item, idx < pending.length - 1 && apc.iDivider]}>
            <View style={apc.itemTop}>
              <Text style={apc.matchLabel} numberOfLines={1}>
                {a.player1} <Text style={{ color: TEXT2, fontWeight: '500' }}>vs</Text> {a.player2}
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
                <Ionicons name="checkmark" size={13} color={ACTIVE_TEXT} />
                <Text style={apc.approveText}>Onayla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[apc.btn, apc.rejectBtn]}
                onPress={() => onReject(a.id)}
              >
                <Ionicons name="close" size={13} color={RED} />
                <Text style={apc.rejectText}>Reddet</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const apc = StyleSheet.create({
  card:        { backgroundColor: CARD, borderRadius: CARD_R, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 0 },
  headRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: TEXT2 },
  headTitle:   { fontSize: 11, fontWeight: '800', color: TEXT1, textTransform: 'uppercase', letterSpacing: 0.7 },
  countChip:   { backgroundColor: AMBER, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  countText:   { fontSize: 11, fontWeight: '800', color: ACTIVE_TEXT },
  emptyRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  emptyText:   { fontSize: 13, fontWeight: '600', color: TEXT2 },
  item:        { paddingVertical: 14, gap: 8 },
  iDivider:    { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  itemTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  matchLabel:  { flex: 1, fontSize: 14, fontWeight: '700', color: TEXT1 },
  scorePill:   { backgroundColor: 'rgba(190,242,100,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(190,242,100,0.22)' },
  scorePillText: { fontSize: 12, fontWeight: '700', color: ACTIVE_TAB },
  statusText:  { fontSize: 11, fontWeight: '500', color: TEXT2 },
  btnRow:      { flexDirection: 'row', gap: 8 },
  btn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  approveBtn:  { backgroundColor: ACTIVE_TAB },
  approveText: { fontSize: 13, fontWeight: '700', color: ACTIVE_TEXT },
  rejectBtn:   { backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  rejectText:  { fontSize: 13, fontWeight: '700', color: RED },
});

// ─── Leaderboard rows ─────────────────────────────────────────────────────────

function LeaderboardHead() {
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
          <Text style={[lbd.cell, { color: rankColor(item.rank) }]}>{item.rank}</Text>
        )}
      </View>
      <Text style={[lbd.colName, lbd.nameText]} numberOfLines={1}>{item.name}</Text>
      <Text style={[lbd.cell, lbd.colNum]}>{item.played}</Text>
      <Text style={[lbd.cell, lbd.colNum, { color: ACCENT }]}>{item.wins}</Text>
      <Text style={[lbd.cell, lbd.colNum, { color: RED }]}>{item.losses}</Text>
      <Text style={[lbd.cell, lbd.colPts, lbd.ptsText]}>{item.points}</Text>
    </View>
  );
}

const lbd = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,23,42,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, backgroundColor: CARD },
  rowAlt:   { backgroundColor: 'rgba(255,255,255,0.018)' },
  rowFirst: { backgroundColor: 'rgba(190,242,100,0.06)' },
  rowLast:  {},
  rDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  rankWrap: { width: 36, alignItems: 'center', justifyContent: 'center' },
  medal:    { fontSize: 16 },
  colRank:  { width: 36, textAlign: 'center' },
  colName:  { flex: 1, marginHorizontal: 4 },
  colNum:   { width: 28, textAlign: 'center' },
  colPts:   { width: 58, textAlign: 'center' },
  cell:     { fontSize: 13, fontWeight: '500', color: TEXT2 },
  nameText: { fontSize: 13, fontWeight: '700', color: TEXT1 },
  ptsText:  { fontWeight: '800', color: ACTIVE_TAB },
});

// ─── OzelTab ──────────────────────────────────────────────────────────────────

type OzelTabProps = {
  approvals:         ApprovalFlow[];
  onApprove:         (id: string) => void;
  onReject:          (id: string) => void;
  bottomPad:         number;
  isLoading:         boolean;
  /** True when the current user is an approved participant of this tournament. */
  isRegistered:      boolean;
  /** True when the logged-in user has the 'organizer' role. */
  isOrganizer:       boolean;
  /** Live Firestore tournament document; null while loading or if none found. */
  tournament:        Tournament | null;
  /** Pre-mapped leaderboard rows from real Firebase data. */
  leaderboardData:   CustomLeaderboardEntry[];
  /** Opens the score-submission bottom sheet. */
  onOpenScoreModal:  () => void;
  /** Triggers a manual standings refresh via the Cloud Function. */
  onRefreshStandings: () => void;
  /** True while the standings refresh request is in-flight. */
  isRefreshing:      boolean;
};

function OzelTab({
  approvals, onApprove, onReject, bottomPad, isLoading,
  isRegistered, isOrganizer, tournament, leaderboardData,
  onOpenScoreModal, onRefreshStandings, isRefreshing,
}: OzelTabProps) {
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
    rest: 0 
  };
  const tieBreaker   = tournament.rules.tieBreaker;

  const ListHeader = (
    <View style={ozt.header}>
      <TournamentBanner
        name={tournament.title}
        season={bannerSeason}
        participants={leaderboardData.length}
        format={tournament.format}
        prize={bannerPrize}
      />

      {/* Score entry CTA — visible only to approved participants */}
      {isRegistered && (
        <TouchableOpacity
          style={ozt.scoreBtn}
          activeOpacity={0.85}
          onPress={onOpenScoreModal}
        >
          <Ionicons name="tennisball-outline" size={16} color={ACTIVE_TAB} />
          <Text style={ozt.scoreBtnText}>🎾 Skor Gir</Text>
        </TouchableOpacity>
      )}

      {/* Puan Güncelle — only shown to organizers when autoUpdate is disabled */}
      {isOrganizer && !tournament.rules.autoUpdate && (
        <TouchableOpacity
          style={[ozt.refreshBtn, isRefreshing && ozt.refreshBtnPending]}
          activeOpacity={0.85}
          disabled={isRefreshing}
          onPress={onRefreshStandings}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={ACTIVE_TAB} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={15} color={ACTIVE_TAB} />
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

const ozt = StyleSheet.create({
  header:      { gap: 20, paddingHorizontal: H_PAD },
  section:     { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: TEXT2, textTransform: 'uppercase', letterSpacing: 1 },
  scoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(190,242,100,0.28)',
    backgroundColor: 'rgba(190,242,100,0.07)',
  },
  scoreBtnText: { fontSize: 14, fontWeight: '700', color: ACTIVE_TAB },
  refreshBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    height:          42,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     'rgba(190,242,100,0.35)',
    backgroundColor: 'rgba(190,242,100,0.05)',
  },
  refreshBtnPending: { opacity: 0.5 },
  refreshBtnText:    { fontSize: 13, fontWeight: '700', color: ACTIVE_TAB },
  tableTopCap: {
    marginHorizontal: H_PAD,
    backgroundColor: CARD,
    borderTopLeftRadius: CARD_R,
    borderTopRightRadius: CARD_R,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: BORDER,
  },
  rowWrap: {
    marginHorizontal: H_PAD,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  tableBottomCap: {
    marginHorizontal: H_PAD,
    height: CARD_R,
    backgroundColor: CARD,
    borderBottomLeftRadius: CARD_R,
    borderBottomRightRadius: CARD_R,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    marginTop: -StyleSheet.hairlineWidth,
  },
});

// ─── SubmitScoreModal ─────────────────────────────────────────────────────────

type SetScore = { myScore: number; oppScore: number };

const MAX_SETS = 5;
const INITIAL_SETS: SetScore[] = [{ myScore: 0, oppScore: 0 }];

type SubmitScoreModalProps = {
  visible: boolean;
  /** Leaderboard entries excluding the current user — used for the opponent picker. */
  availablePlayers: CustomLeaderboardEntry[];
  isSubmitting: boolean;
  /** Called with the selected opponent ID and formatted score string (e.g. "6:4, 3:6, 6:2"). */
  onSubmit: (opponentId: string, scoreStr: string) => void;
  onClose: () => void;
};

function SubmitScoreModal({
  visible,
  availablePlayers,
  isSubmitting,
  onSubmit,
  onClose,
}: SubmitScoreModalProps) {
  const [selectedOpponentId, setSelectedOpponentId] = useState('');
  const [sets, setSets] = useState<SetScore[]>(INITIAL_SETS);

  // Reset form every time the sheet opens
  useEffect(() => {
    if (visible) {
      setSelectedOpponentId('');
      setSets(INITIAL_SETS);
    }
  }, [visible]);

  // Clamp stepper values between 0 and 7 (max tennis game score per set)
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
        {/* Backdrop — tap to dismiss */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={smo.sheet}>
          {/* Handle bar */}
          <View style={smo.handle} />

          {/* Title row */}
          <View style={smo.titleRow}>
            <Text style={smo.title}>Skor Gir</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={TEXT2} />
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

                  {/* My score stepper */}
                  <View style={smo.stepper}>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'myScore', -1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="remove" size={14} color={TEXT1} />
                    </TouchableOpacity>
                    <Text style={smo.stepVal}>{s.myScore}</Text>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'myScore', 1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="add" size={14} color={TEXT1} />
                    </TouchableOpacity>
                  </View>

                  <Text style={smo.vsText}>vs</Text>

                  {/* Opponent score stepper */}
                  <View style={smo.stepper}>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'oppScore', -1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="remove" size={14} color={TEXT1} />
                    </TouchableOpacity>
                    <Text style={smo.stepVal}>{s.oppScore}</Text>
                    <TouchableOpacity
                      style={smo.stepBtn}
                      onPress={() => updateSet(idx, 'oppScore', 1)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="add" size={14} color={TEXT1} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Set management row */}
            <View style={smo.setMgmtRow}>
              {sets.length < MAX_SETS && (
                <TouchableOpacity style={smo.setMgmtBtn} onPress={addSet} activeOpacity={0.75}>
                  <Ionicons name="add" size={13} color={ACTIVE_TAB} />
                  <Text style={smo.setMgmtText}>+ Set Ekle</Text>
                </TouchableOpacity>
              )}
              {sets.length > 1 && (
                <TouchableOpacity
                  style={[smo.setMgmtBtn, smo.setMgmtBtnDanger]}
                  onPress={removeLastSet}
                  activeOpacity={0.75}
                >
                  <Ionicons name="remove" size={13} color={RED} />
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
                <ActivityIndicator color={ACTIVE_TEXT} />
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

const smo = StyleSheet.create({
  // ── Container ──
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CARD,
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
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    color: TEXT1,
    letterSpacing: -0.3,
  },
  section: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT2,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  // ── Opponent pill picker ──
  pillRow:        { gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#1a2744',
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillActive: {
    backgroundColor: 'rgba(190,242,100,0.12)',
    borderColor: 'rgba(190,242,100,0.45)',
  },
  pillText:       { fontSize: 13, fontWeight: '600', color: TEXT2 },
  pillTextActive: { color: ACTIVE_TAB, fontWeight: '700' },
  emptyPill:      { fontSize: 13, fontWeight: '500', color: TEXT2, fontStyle: 'italic' },
  // ── Set stepper rows ──
  setList: { gap: 8 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  setLabel: { fontSize: 12, fontWeight: '700', color: TEXT2, width: 44 },
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
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepVal: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT1,
    minWidth: 24,
    textAlign: 'center',
  },
  vsText: { fontSize: 11, fontWeight: '700', color: TEXT2, letterSpacing: 0.5 },
  // ── Set management ──
  setMgmtRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  setMgmtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(190,242,100,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(190,242,100,0.20)',
  },
  setMgmtBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderColor: 'rgba(239,68,68,0.20)',
  },
  setMgmtText:       { fontSize: 12, fontWeight: '700', color: ACTIVE_TAB },
  setMgmtTextDanger: { color: RED },
  // ── Action buttons ──
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
  cancelText: { fontSize: 15, fontWeight: '600', color: TEXT2 },
  submitBtn: {
    flex: 1,
    height: 50,
    backgroundColor: ACTIVE_TAB,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACTIVE_TAB,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnPending: {
    backgroundColor: 'rgba(190,242,100,0.45)',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: { fontSize: 15, fontWeight: '800', color: ACTIVE_TEXT },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function TournamentScreen() {
  const insets     = useSafeAreaInsets();
  const { uid, hasRole } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<TournamentStackParamList>>();

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

  /** First tournament for the Özel tab — drives banner, settings, and leaderboard. */
  const ozelTournament = activeTab === 'Özel' ? (activeTournaments[0] ?? null) : null;

  /** Live leaderboard rows ready for the FlatList. */
  const leaderboardData = useMemo<CustomLeaderboardEntry[]>(
    () => mapPlayersToLeaderboard(leaderboardPlayers),
    [leaderboardPlayers],
  );

  /** Player is registered if they joined this session or exist in the approved leaderboard. */
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
    // Reset leaderboard so stale data from the previous tab's tournament
    // doesn't flash before the new subscription fires.
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
              <Ionicons name="add" size={20} color="#0f172a" />
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
              <ActivityIndicator color={ACTIVE_TEXT} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={ACTIVE_TEXT} />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const scr = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
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
    backgroundColor: '#bef264',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#bef264',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT1,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },
  fab: {
    position: 'absolute',
    left: H_PAD,
    right: H_PAD,
  },
  fabBtn: {
    height: 56,
    backgroundColor: ACTIVE_TAB,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: ACTIVE_TAB,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 10,
  },
  fabBtnPending: {
    backgroundColor: 'rgba(190,242,100,0.45)',
  },
  fabText: {
    fontSize: 16,
    fontWeight: '800',
    color: ACTIVE_TEXT,
    letterSpacing: 0.2,
  },
});
