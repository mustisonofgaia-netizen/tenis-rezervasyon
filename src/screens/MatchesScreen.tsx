import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import { resolveFullCourtLabel } from '../config/data';
import {
  joinMatch,
  removePlayerFromMatch,
  subscribeToOpenMatches,
} from '../services/matchService';
import {
  avatarColor,
  getParticipantLabel,
  profileCache,
  resolveProfile,
} from '../services/userService';
import type { UserProfile } from '../services/userService';
import type { MatchDocument, SkillLevel } from '../types/match';
import type { ColorTokens } from '../theme/tokens';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Skill-level badge colours are semantic indicators, not brand/theme colours.
 * They stay fixed across light and dark mode.
 */
const SKILL_COLOR: Record<SkillLevel, string> = {
  BEGINNER:     '#22C55E',
  INTERMEDIATE: '#3B82F6',
  ADVANCED:     '#F97316',
};

const SKILL_LABEL: Record<SkillLevel, string> = {
  BEGINNER:     'Başlangıç',
  INTERMEDIATE: 'Orta Seviye',
  ADVANCED:     'İleri Seviye',
};

const CARD_RADIUS = 20;
const H_PAD       = 24;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function fallbackProfile(playerUid: string): UserProfile {
  return {
    initial: (playerUid[0] ?? '?').toUpperCase(),
    color: avatarColor(playerUid),
    displayName: null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMatchDate(dateKey: string, slotTime: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${label} · ${slotTime}`;
}

function resolveCourtLabel(courtId: string): string {
  return resolveFullCourtLabel(courtId);
}

// ─── Theme-aware style factory ────────────────────────────────────────────────

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background.secondary,
    },

    // ── Header ─────────────────────────────────────────────────────────────
    headerSection: {
      paddingHorizontal: H_PAD,
      paddingTop: 28,
      paddingBottom: 20,
    },
    headerTitle: {
      fontSize: 30,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.8,
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 14,
      color: c.text.muted,
      fontWeight: '500',
    },

    // ── Loading ────────────────────────────────────────────────────────────
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── List ──────────────────────────────────────────────────────────────
    listContent: {
      paddingHorizontal: H_PAD,
      paddingBottom: 120,
    },
    listContentEmpty: {
      flex: 1,
      justifyContent: 'center',
    },

    // ── Card ──────────────────────────────────────────────────────────────
    card: {
      backgroundColor: c.surface.card,
      borderRadius: CARD_RADIUS,
      padding: 20,
      marginBottom: 14,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
      elevation: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },

    // ── Skill badge ────────────────────────────────────────────────────────
    skillBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      gap: 5,
    },
    skillDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    skillText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.1,
    },

    // ── Date ──────────────────────────────────────────────────────────────
    dateText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text.primary,
      letterSpacing: 0.1,
    },

    // ── Court ─────────────────────────────────────────────────────────────
    courtRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    courtIcon: {
      marginRight: 6,
    },
    courtText: {
      fontSize: 14,
      fontWeight: '500',
      color: c.text.muted,
    },

    // ── Player list ────────────────────────────────────────────────────────
    playerList: {
      gap: 10,
      marginBottom: 10,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatarWrapper: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.14,
      shadowRadius: 4,
      elevation: 2,
    },
    // Avatar initials are always white regardless of theme since they sit on
    // a saturated dynamic background colour from avatarColor().
    avatarInitial: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    avatarEmpty: {
      backgroundColor: c.surface.raised,
      borderWidth: 1.5,
      borderColor: c.border.default,
    },
    // Host crown — top-right overlay
    crownBadge: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 17,
      height: 17,
      borderRadius: 9,
      // Amber tint — decorative, not a brand/theme colour.
      backgroundColor: '#FEF3C7',
      borderWidth: 1,
      borderColor: '#FDE68A',
      alignItems: 'center',
      justifyContent: 'center',
    },
    crownText: {
      fontSize: 8,
      lineHeight: 10,
    },
    // Kick button — bottom-right overlay (host view only)
    kickBtn: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.surface.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 2,
      elevation: 2,
    },
    playerName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.text.primary,
      letterSpacing: -0.1,
    },
    emptySlotLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: c.text.muted,
    },
    playerCountText: {
      marginBottom: 14,
      fontSize: 12,
      fontWeight: '600',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // ── Join toast ─────────────────────────────────────────────────────────
    joinToast: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      marginHorizontal: H_PAD,
      marginBottom: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      // success token + 8% / 20% opacity via hex alpha
      backgroundColor: c.status.success + '14',
      borderWidth: 1,
      borderColor: c.status.success + '33',
    },
    joinToastText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.status.success,
    },

    // ── Join button ────────────────────────────────────────────────────────
    joinButton: {
      height: 46,
      backgroundColor: c.accent.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 4,
    },
    joinButtonDisabled: {
      backgroundColor: c.surface.raised,
      shadowOpacity: 0,
      elevation: 0,
    },
    joinButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text.inverse,
      letterSpacing: 0.3,
    },
    joinButtonTextDisabled: {
      color: c.text.muted,
    },

    // ── Host badge ─────────────────────────────────────────────────────────
    hostBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.status.success + '14',
    },
    hostBadgeText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.status.success,
    },

    // ── Empty state ────────────────────────────────────────────────────────
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 32,
      gap: 10,
    },
    emptyEmoji: {
      fontSize: 52,
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.3,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      fontWeight: '500',
      color: c.text.muted,
      textAlign: 'center',
      lineHeight: 21,
    },
  });
}

// ─── Match card ───────────────────────────────────────────────────────────────

type MatchCardProps = {
  match: MatchDocument;
  uid: string;
  index: number;
  joiningId: string | null;
  removingId: string | null;
  profiles: Record<string, UserProfile>;
  onJoin: (matchId: string) => void;
  onRemovePlayer: (matchId: string, targetUid: string) => void;
};

function MatchCard({
  match,
  uid,
  index,
  joiningId,
  removingId,
  profiles,
  onJoin,
  onRemovePlayer,
}: MatchCardProps) {
  const { theme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c), [theme]);

  const isHost     = match.hostId === uid;
  const hasJoined  = match.joinedPlayers.includes(uid);
  const isFull     = match.status === 'FULL';
  const isJoining  = joiningId === match.id;
  const isRemoving = removingId === match.id;
  const canJoin    = !isHost && !hasJoined && !isFull && !isJoining;

  const skillColor = SKILL_COLOR[match.skillLevel];
  const skillLabel = SKILL_LABEL[match.skillLevel];
  const courtLabel = resolveCourtLabel(match.courtId);

  const joinLabel = isJoining
    ? ''
    : hasJoined
    ? '✓  Katıldın'
    : isFull
    ? 'Dolu'
    : 'Katıl';

  const emptySlots = Math.max(0, match.requiredPlayers - match.joinedPlayers.length);

  const handleKickPress = useCallback(
    (playerUid: string) => {
      Alert.alert(
        'Oyuncuyu Çıkar',
        'Bu oyuncuyu maçtan çıkarmak istediğinize emin misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Çıkar',
            style: 'destructive',
            onPress: () => onRemovePlayer(match.id, playerUid),
          },
        ],
      );
    },
    [match.id, onRemovePlayer],
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 70).duration(400).easing(Easing.out(Easing.cubic))}
      style={S.card}
    >
      {/* ── Skill badge + date ──────────────── */}
      <View style={S.cardHeader}>
        <View style={[S.skillBadge, { backgroundColor: `${skillColor}1A` }]}>
          <View style={[S.skillDot, { backgroundColor: skillColor }]} />
          <Text style={[S.skillText, { color: skillColor }]}>{skillLabel}</Text>
        </View>
        <Text style={S.dateText}>{formatMatchDate(match.date, match.slotTime)}</Text>
      </View>

      {/* ── Court ───────────────────────────── */}
      <View style={S.courtRow}>
        <Ionicons name="tennisball-outline" size={14} color={c.text.muted} style={S.courtIcon} />
        <Text style={S.courtText}>{courtLabel}</Text>
      </View>

      {/* ── Participants ──────────────────────── */}
      <View style={S.playerList}>
        {match.joinedPlayers.map((playerUid) => {
          const profile      = profiles[playerUid] ?? fallbackProfile(playerUid);
          const isPlayerHost = playerUid === match.hostId;
          const canKick      = isHost && !isPlayerHost && !isRemoving;
          const label        = getParticipantLabel(profile, playerUid, uid);

          return (
            <View key={playerUid} style={S.playerRow}>
              <View style={S.avatarWrapper}>
                <View style={[S.avatar, { backgroundColor: profile.color }]}>
                  <Text style={S.avatarInitial}>{profile.initial}</Text>
                </View>
                {isPlayerHost && (
                  <View style={S.crownBadge}>
                    <Text style={S.crownText}>👑</Text>
                  </View>
                )}
                {canKick && (
                  <TouchableOpacity
                    style={S.kickBtn}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    onPress={() => handleKickPress(playerUid)}
                  >
                    <Ionicons name="close-circle" size={18} color={c.status.danger} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={S.playerName} numberOfLines={1}>
                {label}
                {isPlayerHost ? '  ·  Kurucu' : ''}
              </Text>
            </View>
          );
        })}

        {Array.from({ length: emptySlots }, (_, i) => (
          <View key={`empty-${i}`} style={S.playerRow}>
            <View style={[S.avatar, S.avatarEmpty]}>
              <Ionicons name="add-outline" size={15} color={c.border.default} />
            </View>
            <Text style={S.emptySlotLabel}>Boş yer</Text>
          </View>
        ))}
      </View>

      <Text style={S.playerCountText}>
        Boş Yer: {emptySlots}
      </Text>

      {/* ── CTA ─────────────────────────────── */}
      {isHost ? (
        <View style={S.hostBadgeRow}>
          <Ionicons name="star-outline" size={13} color={c.accent.primary} />
          <Text style={S.hostBadgeText}>Sizin maçınız</Text>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.82}
          disabled={!canJoin}
          onPress={() => onJoin(match.id)}
          style={[S.joinButton, !canJoin && S.joinButtonDisabled]}
        >
          {isJoining ? (
            <ActivityIndicator size="small" color={c.text.inverse} />
          ) : (
            <Text style={[S.joinButtonText, !canJoin && S.joinButtonTextDisabled]}>
              {joinLabel}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const { theme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c), [theme]);

  return (
    <View style={S.emptyState}>
      <Text style={S.emptyEmoji}>🎾</Text>
      <Text style={S.emptyTitle}>Henüz açık maç yok</Text>
      <Text style={S.emptySubtitle}>
        Rezervasyon yapıp ilk ilanı sen oluştur!
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MatchesScreen() {
  const { uid } = useAuth();
  const { requireVerification } = useVerificationGuard();
  const { theme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c), [theme]);

  const [matches, setMatches]     = useState<MatchDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [profiles, setProfiles]   = useState<Record<string, UserProfile>>({});
  const [joinToastVisible, setJoinToastVisible] = useState(false);
  const joinToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (joinToastTimer.current) clearTimeout(joinToastTimer.current);
    };
  }, []);

  const showJoinSuccessToast = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setJoinToastVisible(true);
    if (joinToastTimer.current) clearTimeout(joinToastTimer.current);
    joinToastTimer.current = setTimeout(() => setJoinToastVisible(false), 2000);
  }, []);

  // ── Matches subscription ──────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToOpenMatches((data) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMatches(data);
      setIsLoading(false);
    });
  }, []);

  // ── Batch profile resolution — no N+1 queries ─────────────────────────────
  // Derive a stable key from the sorted set of all unique player UIDs across
  // all matches. Changes only when the player roster actually changes.
  const profilesKey = useMemo(
    () => [...new Set(matches.flatMap((m) => m.joinedPlayers))].sort().join(','),
    [matches],
  );

  useEffect(() => {
    if (!profilesKey) return;

    const uids = profilesKey.split(',');
    const uncached = uids.filter((id) => !profileCache.has(id));

    const applyCache = () => {
      const result: Record<string, UserProfile> = {};
      for (const id of uids) {
        const p = profileCache.get(id);
        if (p) result[id] = p;
      }
      setProfiles(result);
    };

    if (uncached.length === 0) {
      applyCache();
      return;
    }

    Promise.all(uncached.map(resolveProfile))
      .then(applyCache)
      .catch(applyCache); // degrade gracefully — fallback initials still show
  }, [profilesKey]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleJoin = useCallback(
    (matchId: string) => {
      requireVerification(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setJoiningId(matchId);
        try {
          await joinMatch(matchId, uid);
          showJoinSuccessToast();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Katılım başarısız oldu.';
          Alert.alert('Hata', msg);
        } finally {
          setJoiningId(null);
        }
      });
    },
    [requireVerification, showJoinSuccessToast, uid],
  );

  const handleRemovePlayer = useCallback(
    async (matchId: string, targetUid: string) => {
      setRemovingId(matchId);
      try {
        await removePlayerFromMatch(matchId, targetUid, uid);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Oyuncu çıkarılamadı.';
        Alert.alert('Hata', msg);
      } finally {
        setRemovingId(null);
      }
    },
    [uid],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.safeArea}>
      {/* ── Header ──────────────────────────── */}
      <View style={S.headerSection}>
        <Text style={S.headerTitle}>Rakip Bul</Text>
        <Text style={S.headerSubtitle}>Maç bul, partner eşleş</Text>
      </View>

      {joinToastVisible && (
        <View style={S.joinToast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={c.status.success} style={{ marginRight: 6 }} />
          <Text style={S.joinToastText}>Maç başarıyla eklendi!</Text>
        </View>
      )}

      {/* ── Content ─────────────────────────── */}
      {isLoading ? (
        <View style={S.loadingContainer}>
          <ActivityIndicator size="large" color={c.accent.primary} />
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <MatchCard
              match={item}
              uid={uid}
              index={index}
              joiningId={joiningId}
              removingId={removingId}
              profiles={profiles}
              onJoin={handleJoin}
              onRemovePlayer={handleRemovePlayer}
            />
          )}
          ListEmptyComponent={<EmptyState />}
          contentContainerStyle={[
            S.listContent,
            matches.length === 0 && S.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
