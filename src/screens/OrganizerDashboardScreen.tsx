import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TournamentStackParamList } from '../navigation/types';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import type {
  Tournament,
  TournamentMatch,
  TournamentPlayer,
} from '../types/tournament';
import {
  adjustPlayerPoints,
  approveMatchResult,
  approvePlayerRegistration,
  fetchOrganizerTournaments,
  importLegacyStandings,
  rejectMatchResult,
  rejectPlayerRegistration,
  subscribeToPendingPlayers,
  subscribeToTournamentApprovals,
  subscribeToTournamentLeaderboard,
} from '../services/tournamentService';
import type { LegacyStandingImport } from '../services/tournamentService';

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
      paddingBottom: 8,
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
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

    // ── WhatsApp invite bar ───────────────────────────────────────────────────
    inviteBar: {
      marginHorizontal: 16,
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#25D3661A',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#25D36638',
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    inviteBarText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: '#16a34a',
    },
    inviteBarIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#25D36620',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Centre splash (loading / empty) ───────────────────────────────────────
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 16,
    },
    loadingText: {
      fontSize: 14,
      fontWeight: '500',
      color: c.text.muted,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: c.text.primary,
      letterSpacing: -0.3,
      textAlign: 'center',
    },
    emptyHint: {
      fontSize: 14,
      fontWeight: '500',
      color: c.text.muted,
      textAlign: 'center',
      lineHeight: 21,
    },
    emptyCreateBtn: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.accent.primary,
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 6,
    },
    emptyCreateBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text.inverse,
    },

    // ── Tournament selector ───────────────────────────────────────────────────
    selectorRow: {
      flexDirection: 'row',   // explicit — prevents children from stacking
      alignItems: 'center',   // prevent pills from stretching to fill cross-axis
      paddingHorizontal: 16,
      paddingVertical: 3,
      gap: 2,
    },
    selectorPill: {
      alignSelf: 'center',    // shrink-wrap height; do not stretch to fill parent
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border.default,
      backgroundColor: c.surface.card,
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
      marginBottom: 8,
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

    // ── Tools tab ─────────────────────────────────────────────────────────────
    toolsSection: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: c.surface.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      overflow: 'hidden',
    },
    toolsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    toolsSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    toolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    toolBtnIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolBtnLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: c.text.primary,
    },
    toolBtnSub: {
      fontSize: 12,
      fontWeight: '400',
      color: c.text.muted,
      marginTop: 1,
    },
    // Inline point editor
    overrideRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    overridePlayerName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.text.primary,
    },
    overrideInput: {
      width: 70,
      fontSize: 14,
      fontWeight: '700',
      color: c.text.primary,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: c.background.secondary,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border.default,
      textAlign: 'center',
    },
    overrideSaveBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.accent.primary,
    },
    overrideSaveBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text.inverse,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DashboardTab = 'players' | 'matches' | 'tools';

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('tr-TR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

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
  const navigation = useNavigation<NativeStackNavigationProp<TournamentStackParamList>>();
  const { uid }    = useAuth();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const S          = useMemo(() => makeStyles(c), [theme]);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [myTournaments,        setMyTournaments]        = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [pendingPlayers,       setPendingPlayers]       = useState<TournamentPlayer[]>([]);
  const [pendingMatches,       setPendingMatches]       = useState<TournamentMatch[]>([]);
  const [approvedPlayers,      setApprovedPlayers]      = useState<TournamentPlayer[]>([]);
  const [isLoading,            setIsLoading]            = useState(true);
  const [activeTab,            setActiveTab]            = useState<DashboardTab>('players');
  // Per-player override input values (keyed by userId)
  const [pointOverrides,       setPointOverrides]       = useState<Record<string, string>>({});

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

  // ── Real-time approved players (used in Tools / override tab) ───────────────
  useEffect(() => {
    if (!selectedTournamentId) {
      setApprovedPlayers([]);
      return;
    }
    const t = myTournaments.find((x) => x.id === selectedTournamentId);
    if (!t) return;

    return subscribeToTournamentLeaderboard(
      selectedTournamentId,
      t.tieBreakerPriority,
      (players) => {
        setApprovedPlayers(players);
        // Seed override inputs with current points (only on first load)
        setPointOverrides((prev) => {
          const next = { ...prev };
          for (const p of players) {
            if (!(p.userId in next)) next[p.userId] = String(p.points);
          }
          return next;
        });
      },
    );
  }, [selectedTournamentId, myTournaments]);

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

  const handleWhatsAppInvite = useCallback(() => {
    const tournament = myTournaments.find((t) => t.id === selectedTournamentId);
    if (!tournament) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const code    = tournament.inviteCode ?? tournament.id.slice(0, 8).toUpperCase();
    const message =
      `🎾 ${tournament.title} turnuvasına davet edildiniz!\n\n` +
      `Katılmak için uygulamayı açın ve şu kodu girin: *${code}*`;

    Share.share({ message, ...(Platform.OS === 'ios' ? { url: '' } : {}) }).catch(
      (err: unknown) => {
        if (err instanceof Error && !err.message.includes('cancelled')) {
          Alert.alert('Hata', 'Paylaşım başlatılamadı.');
        }
      },
    );
  }, [myTournaments, selectedTournamentId]);

  const handleEditTournament = useCallback(() => {
    if (!selectedTournamentId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('CreateEditTournament', { tournamentId: selectedTournamentId });
  }, [selectedTournamentId, navigation]);

  const handleAdjustPoints = useCallback(
    (userId: string, newPointsStr: string) => {
      const tournamentId = selectedTournamentId;
      if (!tournamentId) return;
      const pts = parseInt(newPointsStr, 10);
      if (isNaN(pts) || pts < 0) {
        Alert.alert('Hata', 'Geçerli bir puan değeri girin.');
        return;
      }
      adjustPlayerPoints(tournamentId, userId, pts)
        .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
        .catch((err: unknown) => {
          Alert.alert('Hata', err instanceof Error ? err.message : 'Puan güncellenemedi.');
        });
    },
    [selectedTournamentId],
  );

  const handleLegacyImport = useCallback(() => {
    if (!selectedTournamentId) return;
    Alert.alert(
      'Geçmiş Veri Yükle',
      'Bu işlem demo verileri turnuvaya aktarır. Gerçek uygulamada CSV/JSON yükleme ile entegre edilecektir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Demo Veriyi Yükle',
          onPress: () => {
            const demoRecords: LegacyStandingImport[] = [
              { userId: 'legacy_player_1', legacyDisplayName: 'Ali Yılmaz',   legacyPoints: 120, legacyWins: 8, legacyMatchesPlayed: 10, importedAt: Date.now() },
              { userId: 'legacy_player_2', legacyDisplayName: 'Mert Kaya',    legacyPoints: 90,  legacyWins: 6, legacyMatchesPlayed: 10, importedAt: Date.now() },
              { userId: 'legacy_player_3', legacyDisplayName: 'Selin Arslan', legacyPoints: 60,  legacyWins: 4, legacyMatchesPlayed: 10, importedAt: Date.now() },
            ];
            importLegacyStandings(selectedTournamentId, demoRecords)
              .then(() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                Alert.alert('Başarılı', '3 oyuncunun geçmiş verisi aktarıldı.');
              })
              .catch((err: unknown) => {
                Alert.alert('Hata', err instanceof Error ? err.message : 'Aktarım başarısız.');
              });
          },
        },
      ],
    );
  }, [selectedTournamentId]);

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

        {/* WhatsApp shortcut icon — always in the right slot when a tournament is selected */}
        {selectedTournament ? (
          <TouchableOpacity
            style={S.backBtn}
            onPress={handleWhatsAppInvite}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
        ) : (
          <View style={S.backBtn} />
        )}
      </View>

      {/* ── WhatsApp invite bar (animated, shown when tournament selected) ── */}
      {selectedTournament && (
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          key={selectedTournamentId}
        >
          <TouchableOpacity
            style={S.inviteBar}
            activeOpacity={0.82}
            onPress={handleWhatsAppInvite}
          >
            <View style={S.inviteBarIcon}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </View>
            <Text style={S.inviteBarText}>WhatsApp ile Davet Et</Text>
            <Ionicons name="chevron-forward" size={16} color="#16a34a" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Loading splash ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={S.center}>
          <ActivityIndicator color={c.accent.primary} size="large" />
          <Text style={S.loadingText}>Turnuvalar yükleniyor…</Text>
        </View>

      ) : myTournaments.length === 0 ? (
        /* ── Premium empty state with CTA ───────────────────────────────── */
        <View style={S.center}>
          <View style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            backgroundColor: c.accent.primary + '14',
            borderWidth: 1.5,
            borderColor: c.accent.primary + '30',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
          }}>
            <Ionicons name="trophy-outline" size={38} color={c.accent.primary} />
          </View>
          <Text style={S.emptyTitle}>Henüz Turnuvanız Yok</Text>
          <Text style={S.emptyHint}>
            İlk turnuvanızı oluşturun ve oyuncuları davet etmeye başlayın.
          </Text>
          <TouchableOpacity
            style={S.emptyCreateBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CreateTournament')}
          >
            <Ionicons name="add-circle-outline" size={18} color={c.text.inverse} />
            <Text style={S.emptyCreateBtnText}>Turnuva Oluştur</Text>
          </TouchableOpacity>
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
                    <Text
                      style={[S.selectorText, active && S.selectorTextActive]}
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

            <TouchableOpacity
              style={[S.tabBtn, activeTab === 'tools' && S.tabBtnActive]}
              onPress={() => setActiveTab('tools')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="build-outline"
                size={14}
                color={activeTab === 'tools' ? c.text.inverse : c.text.muted}
                style={{ marginRight: 5 }}
              />
              <Text style={[S.tabText, activeTab === 'tools' && S.tabTextActive]}>
                Araçlar
              </Text>
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

                  <View style={S.matchMeta}>
                    <View style={S.matchScoreRow}>
                      <Ionicons
                        name="tennisball-outline"
                        size={13}
                        color={c.accent.primary}
                        style={{ marginRight: 5 }}
                      />
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

          {/* ── Tools tab ─────────────────────────────────────────────────── */}
          {activeTab === 'tools' && (
            <ScrollView
              contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Tournament management */}
              <View style={S.toolsSection}>
                <View style={S.toolsSectionHeader}>
                  <Ionicons name="settings-outline" size={13} color="#6b7280" />
                  <Text style={S.toolsSectionTitle}>Turnuva Yönetimi</Text>
                </View>
                <TouchableOpacity
                  style={S.toolBtn}
                  activeOpacity={0.75}
                  onPress={handleEditTournament}
                >
                  <View style={[S.toolBtnIcon, { backgroundColor: c.accent.primary + '15' }]}>
                    <Ionicons name="create-outline" size={18} color={c.accent.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.toolBtnLabel}>Turnuvayı Düzenle</Text>
                    <Text style={S.toolBtnSub}>Başlık, tarih, konum, kuralları güncelle</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[S.toolBtn, { borderBottomWidth: 0 }]}
                  activeOpacity={0.75}
                  onPress={handleLegacyImport}
                >
                  <View style={[S.toolBtnIcon, { backgroundColor: '#f59e0b15' }]}>
                    <Ionicons name="archive-outline" size={18} color="#d97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.toolBtnLabel}>Geçmiş Veri Yükle</Text>
                    <Text style={S.toolBtnSub}>Önceki sistem verilerini aktar</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
                </TouchableOpacity>
              </View>

              {/* Manual point override */}
              <View style={S.toolsSection}>
                <View style={S.toolsSectionHeader}>
                  <Ionicons name="flash-outline" size={13} color="#6b7280" />
                  <Text style={S.toolsSectionTitle}>Manuel Puan Müdahalesi</Text>
                </View>

                {approvedPlayers.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: c.text.muted, textAlign: 'center' }}>
                      Onaylı oyuncu yok.
                    </Text>
                  </View>
                ) : (
                  approvedPlayers.map((player, idx) => (
                    <View
                      key={player.userId}
                      style={[
                        S.overrideRow,
                        idx === approvedPlayers.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={S.overridePlayerName} numberOfLines={1}>
                        {truncateId(player.userId, 18)}
                      </Text>
                      <TextInput
                        style={S.overrideInput}
                        keyboardType="number-pad"
                        value={pointOverrides[player.userId] ?? String(player.points)}
                        onChangeText={(v) =>
                          setPointOverrides((prev) => ({ ...prev, [player.userId]: v }))
                        }
                        selectTextOnFocus
                      />
                      <TouchableOpacity
                        style={S.overrideSaveBtn}
                        activeOpacity={0.8}
                        onPress={() =>
                          handleAdjustPoints(player.userId, pointOverrides[player.userId] ?? String(player.points))
                        }
                      >
                        <Text style={S.overrideSaveBtnText}>Kaydet</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}
