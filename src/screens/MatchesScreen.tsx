import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useVerificationGuard } from '../hooks/useVerificationGuard';
import { resolveFullCourtLabel } from '../config/data';
import {
  joinMatch,
  removePlayerFromMatch,
  subscribeToOpenMatches,
} from '../services/matchService';
import {
  avatarColor,
  profileCache,
  resolveProfile,
} from '../services/userService';
import type { UserProfile } from '../services/userService';
import type { MatchDocument, SkillLevel } from '../types/match';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// Profile cache + helpers are imported from userService (shared singleton).

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
      style={styles.card}
    >
      {/* ── Skill badge + date ──────────────── */}
      <View style={styles.cardHeader}>
        <View style={[styles.skillBadge, { backgroundColor: `${skillColor}1A` }]}>
          <View style={[styles.skillDot, { backgroundColor: skillColor }]} />
          <Text style={[styles.skillText, { color: skillColor }]}>{skillLabel}</Text>
        </View>
        <Text style={styles.dateText}>{formatMatchDate(match.date, match.slotTime)}</Text>
      </View>

      {/* ── Court ───────────────────────────── */}
      <View style={styles.courtRow}>
        <Ionicons name="tennisball-outline" size={14} color="#6B7280" style={styles.courtIcon} />
        <Text style={styles.courtText}>{courtLabel}</Text>
      </View>

      {/* ── Player avatars ───────────────────── */}
      <View style={styles.avatarRow}>
        {match.joinedPlayers.map((playerUid) => {
          const profile = profiles[playerUid] ?? {
            initial: (playerUid[0] ?? '?').toUpperCase(),
            color: avatarColor(playerUid),
          };
          const isPlayerHost = playerUid === match.hostId;
          const canKick = isHost && !isPlayerHost && !isRemoving;

          return (
            <View key={playerUid} style={styles.avatarWrapper}>
              {/* Circle */}
              <View style={[styles.avatar, { backgroundColor: profile.color }]}>
                <Text style={styles.avatarInitial}>{profile.initial}</Text>
              </View>

              {/* 👑 Host crown */}
              {isPlayerHost && (
                <View style={styles.crownBadge}>
                  <Text style={styles.crownText}>👑</Text>
                </View>
              )}

              {/* × Kick button (host only, non-host players) */}
              {canKick && (
                <TouchableOpacity
                  style={styles.kickBtn}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  onPress={() => handleKickPress(playerUid)}
                >
                  <Ionicons name="close-circle" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Empty slots */}
        {Array.from({ length: emptySlots }, (_, i) => (
          <View key={`empty-${i}`} style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="add-outline" size={15} color="#CBD5E1" />
          </View>
        ))}

        <Text style={styles.playerCountText}>
          {match.joinedPlayers.length}/{match.requiredPlayers}
        </Text>
      </View>

      {/* ── CTA ─────────────────────────────── */}
      {isHost ? (
        <View style={styles.hostBadgeRow}>
          <Ionicons name="star-outline" size={13} color="#22C55E" />
          <Text style={styles.hostBadgeText}>Sizin maçınız</Text>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.82}
          disabled={!canJoin}
          onPress={() => onJoin(match.id)}
          style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]}
        >
          {isJoining ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.joinButtonText, !canJoin && styles.joinButtonTextDisabled]}>
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
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🎾</Text>
      <Text style={styles.emptyTitle}>Henüz açık maç yok</Text>
      <Text style={styles.emptySubtitle}>
        Rezervasyon yapıp ilk ilanı sen oluştur!
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MatchesScreen() {
  const { uid } = useAuth();
  const { requireVerification } = useVerificationGuard();

  const [matches, setMatches]     = useState<MatchDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [profiles, setProfiles]   = useState<Record<string, UserProfile>>({});

  // ── Matches subscription ──────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToOpenMatches((data) => {
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
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Katılım başarısız oldu.';
          Alert.alert('Hata', msg);
        } finally {
          setJoiningId(null);
        }
      });
    },
    [requireVerification, uid],
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
    <SafeAreaView style={styles.safeArea}>
      {/* ── Header ──────────────────────────── */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Lobi</Text>
        <Text style={styles.headerSubtitle}>Maç bul, partner eşleş</Text>
      </View>

      {/* ── Content ─────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22C55E" />
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
            styles.listContent,
            matches.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  // ── Header ───────────────────────────────────────────────────────────────
  headerSection: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  // ── Loading ──────────────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── List ─────────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  // ── Skill badge ───────────────────────────────────────────────────────────
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

  // ── Date ──────────────────────────────────────────────────────────────────
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.1,
  },

  // ── Court ─────────────────────────────────────────────────────────────────
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
    color: '#6B7280',
  },

  // ── Avatar row ────────────────────────────────────────────────────────────
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 4,
  },
  // Extra padding around avatar circle to give absolute badges room to breathe
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
  avatarInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarEmpty: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  // Host crown — top-right overlay
  crownBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  playerCountText: {
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },

  // ── Join button ───────────────────────────────────────────────────────────
  joinButton: {
    height: 46,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  joinButtonDisabled: {
    backgroundColor: '#F3F4F6',
    shadowOpacity: 0,
    elevation: 0,
  },
  joinButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  joinButtonTextDisabled: {
    color: '#9CA3AF',
  },

  // ── Host badge ────────────────────────────────────────────────────────────
  hostBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
  },
  hostBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803D',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
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
    color: '#111827',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
  },
});
