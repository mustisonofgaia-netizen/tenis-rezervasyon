import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import type {
  Tournament,
  TournamentMatch,
  TournamentPlayer,
} from '../services/tournamentService';
import {
  approveMatchResult,
  approvePlayerRegistration,
  fetchOrganizerTournaments,
  rejectMatchResult,
  rejectPlayerRegistration,
  subscribeToPendingPlayers,
  subscribeToTournamentApprovals,
} from '../services/tournamentService';

// ─── Theme ────────────────────────────────────────────────────────────────────

const BG     = '#0f172a';
const CARD   = '#1e293b';
const ACCENT = '#bef264';
const BORDER = '#334155';
const TEXT   = '#f1f5f9';
const MUTED  = '#94a3b8';
const DANGER = '#ef4444';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DashboardTab = 'players' | 'matches';

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('tr-TR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

/** Truncates long IDs for display while keeping the string meaningful. */
function truncateId(id: string, max = 20): string {
  return id.length > max ? `${id.slice(0, max - 1)}…` : id;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ActionPairProps = {
  onApprove: () => void;
  onReject:  () => void;
  approveLabel: string;
  rejectLabel:  string;
};

function ActionPair({ onApprove, onReject, approveLabel, rejectLabel }: ActionPairProps) {
  return (
    <View style={d.actionRow}>
      <TouchableOpacity style={[d.actionBtn, d.approveBtn]} onPress={onApprove} activeOpacity={0.8}>
        <Ionicons name="checkmark" size={14} color={BG} style={{ marginRight: 4 }} />
        <Text style={d.approveBtnText}>{approveLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[d.actionBtn, d.rejectBtn]} onPress={onReject} activeOpacity={0.8}>
        <Ionicons name="close" size={14} color={DANGER} style={{ marginRight: 4 }} />
        <Text style={d.rejectBtnText}>{rejectLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={d.listEmpty}>
      <Ionicons name="checkmark-done-outline" size={36} color={BORDER} />
      <Text style={d.listEmptyText}>{message}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function OrganizerDashboardScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid }    = useAuth();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [myTournaments,        setMyTournaments]        = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [pendingPlayers,       setPendingPlayers]       = useState<TournamentPlayer[]>([]);
  const [pendingMatches,       setPendingMatches]       = useState<TournamentMatch[]>([]);
  const [isLoading,            setIsLoading]            = useState(true);
  const [activeTab,            setActiveTab]            = useState<DashboardTab>('players');

  // ── Fetch organizer's tournaments once on mount ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    fetchOrganizerTournaments(uid)
      .then((tournaments) => {
        if (cancelled) return;
        setMyTournaments(tournaments);
        if (tournaments.length > 0 && tournaments[0]) {
          setSelectedTournamentId(tournaments[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          Alert.alert(
            'Hata',
            err instanceof Error ? err.message : 'Turnuvalar yüklenemedi.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [uid]);

  // ── Real-time pending player registrations ───────────────────────────────────
  useEffect(() => {
    if (!selectedTournamentId) {
      setPendingPlayers([]);
      return;
    }
    return subscribeToPendingPlayers(selectedTournamentId, setPendingPlayers);
  }, [selectedTournamentId]);

  // ── Real-time pending match approvals ────────────────────────────────────────
  useEffect(() => {
    if (!selectedTournamentId) {
      setPendingMatches([]);
      return;
    }
    return subscribeToTournamentApprovals(selectedTournamentId, setPendingMatches);
  }, [selectedTournamentId]);

  // ── Player actions ───────────────────────────────────────────────────────────
  const handleApprovePlayer = useCallback(
    (userId: string) => {
      const tournamentId = selectedTournamentId;
      if (!tournamentId) return;

      approvePlayerRegistration(tournamentId, userId)
        .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        .catch((err: unknown) => {
          Alert.alert('Hata', err instanceof Error ? err.message : 'Oyuncu kabul edilemedi.');
        });
    },
    [selectedTournamentId],
  );

  const handleRejectPlayer = useCallback(
    (userId: string) => {
      const tournamentId = selectedTournamentId;
      if (!tournamentId) return;

      Alert.alert(
        'Başvuruyu Reddet',
        'Bu oyuncunun başvurusunu reddetmek istiyor musunuz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Reddet',
            style: 'destructive',
            onPress: () => {
              rejectPlayerRegistration(tournamentId, userId)
                .then(() =>
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
                )
                .catch((err: unknown) => {
                  Alert.alert(
                    'Hata',
                    err instanceof Error ? err.message : 'Başvuru reddedilemedi.',
                  );
                });
            },
          },
        ],
      );
    },
    [selectedTournamentId],
  );

  // ── Match actions ────────────────────────────────────────────────────────────
  const handleApproveMatch = useCallback((matchId: string) => {
    approveMatchResult(matchId)
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch((err: unknown) => {
        Alert.alert('Hata', err instanceof Error ? err.message : 'Maç onaylanamadı.');
      });
  }, []);

  const handleRejectMatch = useCallback((matchId: string) => {
    Alert.alert(
      'Maç Sonucunu Reddet',
      'Bu maç sonucunu reddetmek istiyor musunuz? Oyuncu skoru yeniden girecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Reddet',
          style: 'destructive',
          onPress: () => {
            rejectMatchResult(matchId)
              .then(() =>
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
              )
              .catch((err: unknown) => {
                Alert.alert(
                  'Hata',
                  err instanceof Error ? err.message : 'Maç reddedilemedi.',
                );
              });
          },
        },
      ],
    );
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────
  const selectedTournament = myTournaments.find((t) => t.id === selectedTournamentId);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[d.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={d.header}>
        <TouchableOpacity
          style={d.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>

        <View style={d.headerCenter}>
          <Text style={d.headerTitle}>Organizatör Paneli</Text>
          <Text style={d.headerSub} numberOfLines={1}>
            {selectedTournament ? selectedTournament.title : 'Turnuvalarınız'}
          </Text>
        </View>

        {/* Balance spacer */}
        <View style={d.backBtn} />
      </View>

      {/* ── Loading splash ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={d.center}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={d.loadingText}>Turnuvalar yükleniyor…</Text>
        </View>

      ) : myTournaments.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <View style={d.center}>
          <Ionicons name="trophy-outline" size={52} color={BORDER} />
          <Text style={d.emptyTitle}>Henüz Turnuvanız Yok</Text>
          <Text style={d.emptyHint}>
            Turnuvalar ekranındaki + butonundan yeni bir turnuva oluşturun.
          </Text>
        </View>

      ) : (
        <>
          {/* ── Tournament selector (shown only when > 1 tournament) ────── */}
          {myTournaments.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={d.selectorRow}
            >
              {myTournaments.map((t) => {
                const active = t.id === selectedTournamentId;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[d.selectorPill, active && d.selectorPillActive]}
                    onPress={() => setSelectedTournamentId(t.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[d.selectorText, active && d.selectorTextActive]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* ── Tab bar ──────────────────────────────────────────────────── */}
          <View style={d.tabBar}>
            <TouchableOpacity
              style={[d.tabBtn, activeTab === 'players' && d.tabBtnActive]}
              onPress={() => setActiveTab('players')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person-add-outline"
                size={14}
                color={activeTab === 'players' ? BG : MUTED}
                style={{ marginRight: 5 }}
              />
              <Text style={[d.tabText, activeTab === 'players' && d.tabTextActive]}>
                Başvurular
              </Text>
              {pendingPlayers.length > 0 && (
                <View style={d.badge}>
                  <Text style={d.badgeText}>{pendingPlayers.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[d.tabBtn, activeTab === 'matches' && d.tabBtnActive]}
              onPress={() => setActiveTab('matches')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={activeTab === 'matches' ? BG : MUTED}
                style={{ marginRight: 5 }}
              />
              <Text style={[d.tabText, activeTab === 'matches' && d.tabTextActive]}>
                Maç Onayları
              </Text>
              {pendingMatches.length > 0 && (
                <View style={d.badge}>
                  <Text style={d.badgeText}>{pendingMatches.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Pending player registrations ─────────────────────────────── */}
          {activeTab === 'players' && (
            <FlatList
              data={pendingPlayers}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={[d.list, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<EmptyState message="Bekleyen başvuru yok" />}
              renderItem={({ item }) => (
                <View style={d.card}>
                  <View style={d.cardTop}>
                    <View style={d.playerAvatar}>
                      <Ionicons name="person-outline" size={17} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={d.cardTitle}>{truncateId(item.userId)}</Text>
                      <Text style={d.cardSub}>Başvuru tarihi: {formatDate(item.joinedAt)}</Text>
                    </View>
                  </View>
                  <ActionPair
                    approveLabel="Kabul Et"
                    rejectLabel="Reddet"
                    onApprove={() => handleApprovePlayer(item.userId)}
                    onReject={() => handleRejectPlayer(item.userId)}
                  />
                </View>
              )}
            />
          )}

          {/* ── Pending match approvals ───────────────────────────────────── */}
          {activeTab === 'matches' && (
            <FlatList
              data={pendingMatches}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[d.list, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<EmptyState message="Bekleyen maç onayı yok" />}
              renderItem={({ item }) => (
                <View style={d.card}>
                  {/* Players vs header */}
                  <View style={d.matchHeader}>
                    <Text style={d.matchPlayer} numberOfLines={1}>
                      {truncateId(item.player1Id, 14)}
                    </Text>
                    <View style={d.vsChip}>
                      <Text style={d.vsText}>vs</Text>
                    </View>
                    <Text style={d.matchPlayer} numberOfLines={1}>
                      {truncateId(item.player2Id, 14)}
                    </Text>
                  </View>

                  {/* Score & submitter */}
                  <View style={d.matchMeta}>
                    <View style={d.matchScoreRow}>
                      <Ionicons name="tennisball-outline" size={13} color={ACCENT} style={{ marginRight: 5 }} />
                      <Text style={d.matchScore}>{item.score}</Text>
                    </View>
                    <Text style={d.cardSub}>
                      Gönderen: {truncateId(item.submittedBy, 16)}
                    </Text>
                  </View>

                  <ActionPair
                    approveLabel="Onayla"
                    rejectLabel="Reddet"
                    onApprove={() => handleApproveMatch(item.id)}
                    onReject={() => handleRejectMatch(item.id)}
                  />
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    marginTop: 1,
  },

  // ── Centre splash (loading / empty) ───────────────────────────────────────
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.2,
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
  },

  // ── Tournament selector ───────────────────────────────────────────────────
  selectorRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  selectorPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    maxWidth: 180,
  },
  selectorPillActive: {
    backgroundColor: ACCENT,
    borderColor:     ACCENT,
  },
  selectorText: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  selectorTextActive: {
    color: BG,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: ACCENT,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  tabTextActive: {
    color: BG,
  },
  badge: {
    backgroundColor: DANGER,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  // ── FlatList container ────────────────────────────────────────────────────
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  listEmpty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  listEmptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
  },

  // ── Item card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1a2e1a',
    borderWidth: 1,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.1,
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    marginTop: 2,
  },

  // ── Match card specifics ──────────────────────────────────────────────────
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchPlayer: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
  },
  vsChip: {
    backgroundColor: BORDER,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  vsText: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchMeta: {
    gap: 4,
  },
  matchScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchScore: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.3,
  },

  // ── Action pair ───────────────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveBtn: {
    backgroundColor: ACCENT,
  },
  approveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BG,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: DANGER,
  },
});
