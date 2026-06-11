import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { removePlayerFromMatch } from '../services/matchService';
import {
  avatarColor,
  profileCache,
  resolveProfile,
} from '../services/userService';
import type { UserProfile } from '../services/userService';
import type { MatchDocument, SkillLevel } from '../types/match';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchBookingDetails = {
  courtName: string;
  date: string;
  slotTime: string;
};

type MatchDetailsModalProps = {
  isVisible: boolean;
  match: MatchDocument;
  bookingDetails: MatchBookingDetails;
  onClose: () => void;
};

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateKey: string, slotTime: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `${label} · ${slotTime}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MatchDetailsModal({
  isVisible,
  match,
  bookingDetails,
  onClose,
}: MatchDetailsModalProps) {
  const { uid } = useAuth();

  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const isHost   = match.hostId === uid;
  const isFull   = match.status === 'FULL';
  const skillColor = SKILL_COLOR[match.skillLevel];
  const skillLabel = SKILL_LABEL[match.skillLevel];

  // ── Fetch profiles when the modal opens or the player list changes ─────────
  const playersKey = match.joinedPlayers.join(',');

  useEffect(() => {
    if (!isVisible) return;

    const uids = [...match.joinedPlayers];
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

    Promise.all(uncached.map(resolveProfile)).then(applyCache).catch(applyCache);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, match.id, playersKey]);

  // ── Kick handler ──────────────────────────────────────────────────────────
  const handleKick = useCallback(
    (playerUid: string) => {
      Alert.alert(
        'Oyuncuyu Çıkar',
        'Bu oyuncuyu maçtan çıkarmak istediğinize emin misiniz?',
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Çıkar',
            style: 'destructive',
            onPress: async () => {
              setRemovingUid(playerUid);
              try {
                await removePlayerFromMatch(match.id, playerUid, uid);
              } catch (error) {
                const msg =
                  error instanceof Error ? error.message : 'Oyuncu çıkarılamadı.';
                Alert.alert('Hata', msg);
              } finally {
                setRemovingUid(null);
              }
            },
          },
        ],
      );
    },
    [match.id, uid],
  );

  const emptySlots = Math.max(0, match.requiredPlayers - match.joinedPlayers.length);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop — fades independently, never slides */}
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
        pointerEvents="none"
      />

      <View style={styles.overlay}>
        {/* Tap-to-close area above the sheet */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        {/* ── Animated sheet — slides up with spring bounce ──────── */}
        <Animated.View
          entering={SlideInDown.springify().mass(0.3).damping(18).stiffness(120)}
          exiting={SlideOutDown.duration(250)}
          style={styles.sheet}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header row */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Maç Detayları</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="close-circle" size={26} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* ── Status + skill row ──────────────── */}
            <View style={styles.metaRow}>
              <View style={[styles.statusPill, isFull ? styles.statusFull : styles.statusOpen]}>
                <Text style={[styles.statusText, isFull ? styles.statusTextFull : styles.statusTextOpen]}>
                  {isFull
                    ? `${match.joinedPlayers.length}/${match.requiredPlayers} KONTENJAN DOLDU`
                    : 'AÇIK'}
                </Text>
              </View>

              <View style={[styles.skillPill, { backgroundColor: `${skillColor}1A` }]}>
                <View style={[styles.skillDot, { backgroundColor: skillColor }]} />
                <Text style={[styles.skillText, { color: skillColor }]}>{skillLabel}</Text>
              </View>
            </View>

            {/* ── Booking info ────────────────────── */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="tennisball-outline" size={15} color="#6B7280" />
                <Text style={styles.infoText}>{bookingDetails.courtName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                <Text style={styles.infoText}>
                  {formatDate(bookingDetails.date, bookingDetails.slotTime)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* ── Players section ─────────────────── */}
            <Text style={styles.sectionLabel}>Oyuncular</Text>

            <View style={styles.playerList}>
              {match.joinedPlayers.map((playerUid) => {
                const profile = profiles[playerUid] ?? {
                  initial: (playerUid[0] ?? '?').toUpperCase(),
                  color: avatarColor(playerUid),
                };
                const isPlayerHost  = playerUid === match.hostId;
                const isCurrentUser = playerUid === uid;
                const canKick       = isHost && !isPlayerHost;
                const isBeingRemoved = removingUid === playerUid;

                return (
                  <View key={playerUid} style={styles.playerRow}>
                    {/* Avatar */}
                    <View style={styles.playerAvatarWrapper}>
                      <View style={[styles.playerAvatar, { backgroundColor: profile.color }]}>
                        <Text style={styles.playerAvatarInitial}>{profile.initial}</Text>
                      </View>
                      {isPlayerHost && (
                        <View style={styles.crownBadge}>
                          <Text style={styles.crownText}>👑</Text>
                        </View>
                      )}
                    </View>

                    {/* Labels */}
                    <View style={styles.playerInfo}>
                      <Text style={styles.playerRole}>
                        {isPlayerHost ? 'Maç Sahibi' : 'Katılımcı'}
                        {isCurrentUser ? ' · Sen' : ''}
                      </Text>
                      <Text style={styles.playerUid} numberOfLines={1}>
                        {playerUid.slice(0, 12)}…
                      </Text>
                    </View>

                    {/* Kick button (host only) */}
                    {canKick && (
                      <TouchableOpacity
                        disabled={isBeingRemoved}
                        onPress={() => handleKick(playerUid)}
                        style={styles.kickBtn}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        {isBeingRemoved ? (
                          <ActivityIndicator size="small" color="#EF4444" />
                        ) : (
                          <Ionicons name="close-circle-outline" size={22} color="#EF4444" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* Empty slots */}
              {Array.from({ length: emptySlots }, (_, i) => (
                <View key={`empty-${i}`} style={[styles.playerRow, styles.playerRowEmpty]}>
                  <View style={[styles.playerAvatar, styles.playerAvatarEmpty]}>
                    <Ionicons name="add-outline" size={17} color="#CBD5E1" />
                  </View>
                  <Text style={styles.emptySlotText}>Boş yer</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 44,
    maxHeight: '80%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginBottom: 18,
  },

  // ── Sheet header ─────────────────────────────────────────────────────────
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.4,
  },

  // ── Status + skill row ────────────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusOpen: {
    backgroundColor: '#DCFCE7',
  },
  statusFull: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextOpen: {
    color: '#15803D',
  },
  statusTextFull: {
    color: '#92400E',
  },
  skillPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  skillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  skillText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Info card ─────────────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    flex: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginBottom: 18,
  },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 14,
  },

  // ── Player list ───────────────────────────────────────────────────────────
  playerList: {
    gap: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerRowEmpty: {
    opacity: 0.45,
  },
  playerAvatarWrapper: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  playerAvatarEmpty: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  playerAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
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
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  playerRole: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  playerUid: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '400',
  },
  emptySlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  kickBtn: {
    padding: 4,
  },
});
