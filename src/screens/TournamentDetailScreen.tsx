/**
 * @file src/screens/TournamentDetailScreen.tsx
 *
 * Three-tab tournament detail view:
 *   "Bilgi"        — scheduling, location, payment, format
 *   "Puan Durumu"  — real-time leaderboard (respects visibilityRules)
 *   "Kurallar"     — matchRules + tieBreakerPriority
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import type {
  TieBreakerCriterion,
  Tournament,
  TournamentPlayer,
  TournamentStatus,
} from '../types/tournament';
import {
  fetchTournamentById,
  subscribeToTournamentLeaderboard,
} from '../services/tournamentService';
import type { TournamentStackParamList } from '../navigation/types';
import { SegmentedControl } from '../components/tournament';
import type { Segment } from '../components/tournament';

// ─── Navigation / route ───────────────────────────────────────────────────────

type DetailRoute = RouteProp<TournamentStackParamList, 'TournamentDetail'>;
type DetailNav   = NativeStackNavigationProp<TournamentStackParamList, 'TournamentDetail'>;

// ─── Constants ────────────────────────────────────────────────────────────────

type DetailTab = 'info' | 'standings' | 'rules';

const DETAIL_SEGMENTS: Segment[] = [
  { key: 'info',      label: 'Bilgi' },
  { key: 'standings', label: 'Puan Durumu' },
  { key: 'rules',     label: 'Kurallar' },
];

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background.secondary },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    backIcon: { width: 40, alignItems: 'flex-start' },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
      color: c.text.primary,
      letterSpacing: -0.3,
    },
    // Info tab
    infoScroll: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
    sectionCard: {
      backgroundColor: c.surface.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 13,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    infoLabel: { fontSize: 14, fontWeight: '500', color: c.text.muted },
    infoValue: { fontSize: 14, fontWeight: '600', color: c.text.primary, textAlign: 'right', flex: 1, marginLeft: 12 },
    legacyBanner: {
      marginHorizontal: 16,
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.status.warning + '1A',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.status.warning + '3D',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    legacyText: { flex: 1, fontSize: 13, fontWeight: '500', color: c.status.warning },
    // Standings tab
    leaderboardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: c.surface.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    lbHeaderRank: { width: 32, fontSize: 11, fontWeight: '700', color: c.text.muted, textAlign: 'center' },
    lbHeaderName: { flex: 1, fontSize: 11, fontWeight: '700', color: c.text.muted },
    lbHeaderStat: { width: 44, fontSize: 11, fontWeight: '700', color: c.text.muted, textAlign: 'center' },
    lbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '60',
    },
    lbRank: { width: 32, fontSize: 14, fontWeight: '800', color: c.accent.primary, textAlign: 'center' },
    lbName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text.primary },
    lbStat: { width: 44, fontSize: 13, fontWeight: '600', color: c.text.muted, textAlign: 'center' },
    lbStatHighlight: { color: c.accent.primary },
    emptyStandings: {
      alignItems: 'center',
      paddingTop: 60,
      gap: 12,
    },
    emptyText: { fontSize: 14, fontWeight: '500', color: c.text.muted, textAlign: 'center' },
    // Rules tab
    rulesScroll: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    ruleLabel: { fontSize: 14, fontWeight: '500', color: c.text.muted },
    ruleValue: { fontSize: 14, fontWeight: '700', color: c.text.primary },
    ruleBool: { fontSize: 13, fontWeight: '700' },
    tieBreakerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    tieBreakerRank: {
      width: 24,
      height: 24,
      borderRadius: 7,
      backgroundColor: c.accent.primary + '1A',
      borderWidth: 1,
      borderColor: c.accent.primary + '40',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tieBreakerRankText: { fontSize: 11, fontWeight: '800', color: c.accent.primary },
    tieBreakerLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text.primary },
    // Shared
    mutedText: { fontSize: 14, fontWeight: '500', color: c.text.muted },
    errorText: { fontSize: 16, fontWeight: '600', textAlign: 'center', color: c.text.primary },
    backBtn: {
      marginTop: 8,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    backBtnText: { fontSize: 15, fontWeight: '700' },
    idText: { fontSize: 11, textAlign: 'center', letterSpacing: 0.3, color: c.text.muted },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(epochMs: number): string {
  if (!epochMs) return '—';
  return new Date(epochMs).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function statusLabel(s: TournamentStatus): string {
  if (s === 'active')   return 'Aktif';
  if (s === 'upcoming') return 'Yakında';
  return 'Tamamlandı';
}

const TIE_BREAKER_LABELS: Record<TieBreakerCriterion, string> = {
  head_to_head:    'Birbirine Karşı Maç',
  set_difference:  'Set Farkı',
  game_difference: 'Oyun Farkı',
  power_points:    'Güç Puanı',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors), [theme]);
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={S.infoValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function InfoTab({ tournament, S }: { tournament: Tournament; S: ReturnType<typeof makeStyles> }) {
  const isPaid = tournament.paymentMethod !== 'free';

  return (
    <ScrollView
      contentContainerStyle={[S.infoScroll, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {tournament.hasLegacyData && (
        <View style={S.legacyBanner}>
          <Ionicons name="archive-outline" size={16} color="#d97706" />
          <Text style={S.legacyText}>
            Bu turnuva geçmiş verilerle başlatılmıştır. Bazı istatistikler aktarılmış kayıtlara dayanmaktadır.
          </Text>
        </View>
      )}

      <View style={S.sectionCard}>
        <View style={S.sectionHeader}>
          <Ionicons name="calendar-outline" size={14} color="#6b7280" />
          <Text style={S.sectionTitle}>Zamanlama & Konum</Text>
        </View>
        <InfoRow label="Başlangıç"  value={formatDate(tournament.startDate)} />
        <InfoRow label="Bitiş"      value={formatDate(tournament.endDate)} />
        <InfoRow label="Konum"      value={tournament.location} />
      </View>

      <View style={S.sectionCard}>
        <View style={S.sectionHeader}>
          <Ionicons name="trophy-outline" size={14} color="#6b7280" />
          <Text style={S.sectionTitle}>Turnuva Bilgileri</Text>
        </View>
        <InfoRow label="Tür"         value={tournament.type} />
        <InfoRow label="Format"      value={tournament.format} />
        <InfoRow label="Durum"       value={statusLabel(tournament.status)} />
        <InfoRow label="Görünürlük"  value={tournament.visibility === 'private' ? 'Özel 🔒' : 'Herkese Açık'} />
        {tournament.visibility === 'private' && tournament.inviteCode && (
          <InfoRow label="Davet Kodu" value={tournament.inviteCode} />
        )}
      </View>

      <View style={S.sectionCard}>
        <View style={S.sectionHeader}>
          <Ionicons name="card-outline" size={14} color="#6b7280" />
          <Text style={S.sectionTitle}>Ödeme & Puanlama</Text>
        </View>
        <InfoRow label="Katılım Ücreti"  value={isPaid ? `₺${tournament.entryFee}` : 'Ücretsiz'} />
        {isPaid && <InfoRow label="Ödeme Yöntemi" value={tournament.paymentMethod === 'in_app' ? 'Uygulama İçi' : 'Manuel'} />}
        <InfoRow label="Puanlama"        value={tournament.scoringSystem === 'custom' ? 'Özel Güç Puanı' : 'Klasik'} />
        {tournament.scoringSystem === 'custom' && (
          <InfoRow
            label="Güncelleme Sıklığı"
            value={
              tournament.powerPointConfig.updateFrequency === 'dynamic'  ? 'Anlık (Her Maçtan Sonra)' :
              tournament.powerPointConfig.updateFrequency === 'periodic' ? 'Periyodik' :
                                                                           'Manuel'
            }
          />
        )}
      </View>

      <Text style={S.idText}>ID: {tournament.id}</Text>
    </ScrollView>
  );
}

function StandingsTab({
  tournament,
  S,
}: {
  tournament: Tournament;
  S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const vr = tournament.visibilityRules;

  useEffect(() => {
    const unsub = subscribeToTournamentLeaderboard(
      tournament.id,
      tournament.tieBreakerPriority,
      (data) => {
        setPlayers(data);
        setIsLoading(false);
      },
    );
    return unsub;
  }, [tournament.id]);

  const keyExtractor = useCallback((item: TournamentPlayer) => item.userId, []);

  const renderItem = useCallback(
    ({ item, index }: { item: TournamentPlayer; index: number }) => (
      <View style={S.lbRow}>
        <Text style={S.lbRank}>{index + 1}</Text>
        <Text style={S.lbName} numberOfLines={1}>{item.userId.slice(0, 18)}</Text>
        {vr.showMatchesPlayed && <Text style={S.lbStat}>{item.played}</Text>}
        {vr.showWins          && <Text style={S.lbStat}>{item.wins}</Text>}
        {vr.showGamesWon      && <Text style={S.lbStat}>{item.wins - item.losses}</Text>}
        {vr.showPowerPoints   && (
          <Text style={[S.lbStat, S.lbStatHighlight]}>{item.points}</Text>
        )}
      </View>
    ),
    [vr, S],
  );

  if (isLoading) {
    return (
      <View style={S.center}>
        <ActivityIndicator color={c.accent.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Column header */}
      <View style={S.leaderboardHeader}>
        <Text style={S.lbHeaderRank}>#</Text>
        <Text style={S.lbHeaderName}>Oyuncu</Text>
        {vr.showMatchesPlayed && <Text style={S.lbHeaderStat}>O</Text>}
        {vr.showWins          && <Text style={S.lbHeaderStat}>G</Text>}
        {vr.showGamesWon      && <Text style={S.lbHeaderStat}>±</Text>}
        {vr.showPowerPoints   && <Text style={[S.lbHeaderStat, { color: c.accent.primary }]}>PP</Text>}
      </View>
      <FlatList
        data={players}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={S.emptyStandings}>
            <Ionicons name="podium-outline" size={40} color={c.border.default} />
            <Text style={S.emptyText}>
              Henüz onaylı oyuncu yok.{'\n'}İlk onaylandığında sıralama burada görünecek.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function RulesTab({
  tournament,
  S,
}: {
  tournament: Tournament;
  S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const mr = tournament.matchRules;

  return (
    <ScrollView
      contentContainerStyle={[S.rulesScroll, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Match rules */}
      <View style={S.sectionCard}>
        <View style={S.sectionHeader}>
          <Ionicons name="tennisball-outline" size={14} color="#6b7280" />
          <Text style={S.sectionTitle}>Maç Kuralları</Text>
        </View>
        <View style={S.ruleRow}>
          <Text style={S.ruleLabel}>Kazanmak için set sayısı</Text>
          <Text style={S.ruleValue}>{mr.setsToWin} set</Text>
        </View>
        <View style={S.ruleRow}>
          <Text style={S.ruleLabel}>2 fark kuralı</Text>
          <Text style={[S.ruleBool, { color: mr.winByTwo ? c.status.success : c.text.muted }]}>
            {mr.winByTwo ? 'Aktif ✓' : 'Pasif'}
          </Text>
        </View>
        <View style={[S.ruleRow, { borderBottomWidth: 0 }]}>
          <Text style={S.ruleLabel}>Son set tie-break</Text>
          <Text style={[S.ruleBool, { color: mr.lastSetTieBreak ? c.status.success : c.text.muted }]}>
            {mr.lastSetTieBreak ? 'Aktif ✓' : 'Pasif'}
          </Text>
        </View>
      </View>

      {/* Tie-breaker priority */}
      <View style={S.sectionCard}>
        <View style={S.sectionHeader}>
          <Ionicons name="swap-vertical-outline" size={14} color="#6b7280" />
          <Text style={S.sectionTitle}>Eşitlik Bozma Sırası</Text>
        </View>
        {tournament.tieBreakerPriority.map((criterion, idx) => (
          <View
            key={criterion}
            style={[S.tieBreakerItem, idx === tournament.tieBreakerPriority.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={S.tieBreakerRank}>
              <Text style={S.tieBreakerRankText}>{idx + 1}</Text>
            </View>
            <Text style={S.tieBreakerLabel}>{TIE_BREAKER_LABELS[criterion]}</Text>
          </View>
        ))}
      </View>

      {/* Custom scoring tiers */}
      {tournament.scoringSystem === 'custom' && (
        <View style={S.sectionCard}>
          <View style={S.sectionHeader}>
            <Ionicons name="flash-outline" size={14} color="#6b7280" />
            <Text style={S.sectionTitle}>Güç Puanı Kademeleri</Text>
          </View>
          {tournament.powerPointConfig.tierAssignments.map((tier, idx) => (
            <View
              key={idx}
              style={[S.ruleRow, idx === tournament.powerPointConfig.tierAssignments.length - 1 && { borderBottomWidth: 0 }]}
            >
              <Text style={S.ruleLabel}>
                {tier.rankStart === tier.rankEnd
                  ? `${tier.rankStart}. sıra`
                  : `${tier.rankStart}–${tier.rankEnd}. sıra`}
              </Text>
              <Text style={[S.ruleValue, { color: c.accent.primary }]}>
                {tier.pointsAssigned} puan
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function TournamentDetailScreen() {
  const insets     = useSafeAreaInsets();
  const route      = useRoute<DetailRoute>();
  const navigation = useNavigation<DetailNav>();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const S          = useMemo(() => makeStyles(c), [theme]);

  const { tournamentId } = route.params;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<DetailTab>('info');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchTournamentById(tournamentId)
      .then((data) => { if (!cancelled) setTournament(data); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Turnuva yüklenemedi.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tournamentId]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[S.root, S.center]}>
        <ActivityIndicator size="large" color={c.accent.primary} />
        <Text style={S.mutedText}>Yükleniyor…</Text>
      </View>
    );
  }

  // ── Error / not-found ─────────────────────────────────────────────────────

  if (error || !tournament) {
    return (
      <View style={[S.root, S.center, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={52} color="#ef4444" />
        <Text style={S.errorText}>{error ?? 'Turnuva bulunamadı.'}</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
          style={[S.backBtn, { backgroundColor: c.accent.primary }]}
        >
          <Text style={[S.backBtnText, { color: c.text.inverse }]}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* ── Custom header ─────────────────────────────────────────────── */}
      <View style={[S.header, { borderBottomColor: c.border.default }]}>
        <TouchableOpacity
          style={S.backIcon}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={S.headerTitle} numberOfLines={1}>{tournament.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Tab control ───────────────────────────────────────────────── */}
      <View style={{ paddingVertical: 12 }}>
        <SegmentedControl
          segments={DETAIL_SEGMENTS}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as DetailTab)}
          marginHorizontal={16}
        />
      </View>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      {activeTab === 'info'      && <InfoTab      tournament={tournament} S={S} />}
      {activeTab === 'standings' && <StandingsTab tournament={tournament} S={S} />}
      {activeTab === 'rules'     && <RulesTab     tournament={tournament} S={S} />}

    </View>
  );
}
