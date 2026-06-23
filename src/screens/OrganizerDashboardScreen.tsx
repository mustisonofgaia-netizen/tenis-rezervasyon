import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
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

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.surface.card,
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
      color: c.text.primary,
      letterSpacing: -0.2,
    },
    headerSub: {
      fontSize: 12,
      fontWeight: '500',
      color: c.text.muted,
      marginTop: 1,
    },

    // ── Centre splash (loading / empty) ────────────────────────────────────────
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
      color: c.text.muted,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.2,
    },
    emptyHint: {
      fontSize: 13,
      fontWeight: '500',
      color: c.text.muted,
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
      borderColor: c.border.default,
      backgroundColor: c.surface.card,
      maxWidth: 180,
    },
    selectorPillActive: {
      backgroundColor: c.accent.primary,
      borderColor:     c.accent.primary,
    },
    selectorText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.muted,
    },
    selectorTextActive: {
      color: c.text.inverse,
    },

    // ── Tab bar ───────────────────────────────────────────────────────────────
    tabBar: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: c.surface.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
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
      backgroundColor: c.accent.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.muted,
    },
    tabTextActive: {
      color: c.text.inverse,
    },
    badge: {
      backgroundColor: c.status.danger,
      borderRadius: 8,
      paddingHorizontal: 5,
      paddingVertical: 1,
      marginLeft: 4,
      minWidth: 18,
      alignItems: 'center',
    },
    // badge text is always white since it sits on the danger (red) background
    badgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#ffffff',
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
      color: c.text.muted,
    },

    // ── Item card ─────────────────────────────────────────────────────────────
    card: {
      backgroundColor: c.surface.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
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
      // accent tint background for the player avatar icon
      backgroundColor: c.accent.primary + '1A',
      borderWidth: 1,
      borderColor: c.accent.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.1,
    },
    cardSub: {
      fontSize: 12,
      fontWeight: '500',
      color: c.text.muted,
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
      color: c.text.primary,
      textAlign: 'center',
    },
    vsChip: {
      backgroundColor: c.border.default,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    vsText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.text.muted,
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
      color: c.accent.primary,
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
      backgroundColor: c.accent.primary,
    },
    approveBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text.inverse,
    },
    rejectBtn: {
      backgroundColor: c.status.danger + '1F',
      borderWidth: 1,
      borderColor: c.status.danger + '4D',
    },
    rejectBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.status.danger,
    },
  });
}

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
  const { theme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c), [theme]);

  return (
    <View style={S.actionRow}>
      <TouchableOpacity style={[S.actionBtn, S.approveBtn]} onPress={onApprove} activeOpacity={0.8}>
        <Ionicons name="checkmark" size={14} color={c.text.inverse} style={{ marginRight: 4 }} />
        <Text style={S.approveBtnText}>{approveLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[S.actionBtn, S.rejectBtn]} onPress={onReject} activeOpacity={0.8}>
        <Ionicons name="close" size={14} color={c.status.danger} style={{ marginRight: 4 }} />
        <Text style={S.rejectBtnText}>{rejectLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c), [theme]);

  return (
    <View style={S.listEmpty}>
      <Ionicons name="checkmark-done-outline" size={36} color={c.border.default} />
      <Text style={S.listEmptyText}>{message}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function OrganizerDashboardScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid }    = useAuth();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const S          = useMemo(() => makeStyles(c), [theme]);

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
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={S.header}>
        <TouchableOpacity
          style={S.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={c.text.primary} />
        </TouchableOpacity>

        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>Organizatör Paneli</Text>
          <Text style={S.headerSub} numberOfLines={1}>
            {selectedTournament ? selectedTournament.title : 'Turnuvalarınız'}
          </Text>
        </View>

        {/* Balance spacer */}
        <View style={S.backBtn} />
      </View>

      {/* ── Loading splash ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={S.center}>
          <ActivityIndicator color={c.accent.primary} size="large" />
          <Text style={S.loadingText}>Turnuvalar yükleniyor…</Text>
        </View>

      ) : myTournaments.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <View style={S.center}>
          <Ionicons name="trophy-outline" size={52} color={c.border.default} />
          <Text style={S.emptyTitle}>Henüz Turnuvanız Yok</Text>
          <Text style={S.emptyHint}>
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
              contentContainerStyle={S.selectorRow}
            >
              {myTournaments.map((t) => {
                const active = t.id === selectedTournamentId;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[S.selectorPill, active && S.selectorPillActive]}
                    onPress={() => setSelectedTournamentId(t.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.selectorText, active && S.selectorTextActive]}
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
          <View style={S.tabBar}>
            <TouchableOpacity
              style={[S.tabBtn, activeTab === 'players' && S.tabBtnActive]}
              onPress={() => setActiveTab('players')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person-add-outline"
                size={14}
                color={activeTab === 'players' ? c.text.inverse : c.text.muted}
                style={{ marginRight: 5 }}
              />
              <Text style={[S.tabText, activeTab === 'players' && S.tabTextActive]}>
                Başvurular
              </Text>
              {pendingPlayers.length > 0 && (
                <View style={S.badge}>
                  <Text style={S.badgeText}>{pendingPlayers.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[S.tabBtn, activeTab === 'matches' && S.tabBtnActive]}
              onPress={() => setActiveTab('matches')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={activeTab === 'matches' ? c.text.inverse : c.text.muted}
                style={{ marginRight: 5 }}
              />
              <Text style={[S.tabText, activeTab === 'matches' && S.tabTextActive]}>
                Maç Onayları
              </Text>
              {pendingMatches.length > 0 && (
                <View style={S.badge}>
                  <Text style={S.badgeText}>{pendingMatches.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Pending player registrations ─────────────────────────────── */}
          {activeTab === 'players' && (
            <FlatList
              data={pendingPlayers}
              keyExtractor={(item) => item.userId}
              contentContainerStyle={[S.list, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<EmptyState message="Bekleyen başvuru yok" />}
              renderItem={({ item }) => (
                <View style={S.card}>
                  <View style={S.cardTop}>
                    <View style={S.playerAvatar}>
                      <Ionicons name="person-outline" size={17} color={c.accent.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.cardTitle}>{truncateId(item.userId)}</Text>
                      <Text style={S.cardSub}>Başvuru tarihi: {formatDate(item.joinedAt)}</Text>
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
              contentContainerStyle={[S.list, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<EmptyState message="Bekleyen maç onayı yok" />}
              renderItem={({ item }) => (
                <View style={S.card}>
                  {/* Players vs header */}
                  <View style={S.matchHeader}>
                    <Text style={S.matchPlayer} numberOfLines={1}>
                      {truncateId(item.player1Id, 14)}
                    </Text>
                    <View style={S.vsChip}>
                      <Text style={S.vsText}>vs</Text>
                    </View>
                    <Text style={S.matchPlayer} numberOfLines={1}>
                      {truncateId(item.player2Id, 14)}
                    </Text>
                  </View>

                  {/* Score & submitter */}
                  <View style={S.matchMeta}>
                    <View style={S.matchScoreRow}>
                      <Ionicons name="tennisball-outline" size={13} color={c.accent.primary} style={{ marginRight: 5 }} />
                      <Text style={S.matchScore}>{item.score}</Text>
                    </View>
                    <Text style={S.cardSub}>
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
