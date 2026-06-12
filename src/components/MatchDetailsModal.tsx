import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

const CUBIC_OUT = Easing.out(Easing.cubic);
const SHEET_ENTER = SlideInDown.duration(360).easing(CUBIC_OUT);
const SHEET_EXIT  = SlideOutDown.duration(250);
const FADE_DOWN   = FadeInDown.duration(400).easing(CUBIC_OUT);
const LAYOUT      = LinearTransition.duration(300).easing(CUBIC_OUT);
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import {
  cancelMatchListing,
  LEAVE_LOCK_HOURS,
  leaveMatch,
  removePlayerFromMatch,
} from '../services/matchService';
import { submitMatchScore, updateMatchScore } from '../services/scoreService';
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

type ScoreSet = {
  /** Stable identity key for Reanimated — never reassigned after creation */
  id: number;
  hostScore: number;
  opponentScore: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SETS  = 5;
const MAX_GAMES = 99;

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
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return `${label} · ${slotTime}`;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(MAX_GAMES, v));
}

/** Parse "6-4, 7-5" back into a ScoreSet array, assigning sequential stable IDs. */
function parseSets(score: string, startId: number): ScoreSet[] {
  return score.split(',').map((seg, i) => {
    const parts = seg.trim().split('-').map(Number);
    return {
      id:           startId + i,
      hostScore:    isNaN(parts[0] ?? NaN) ? 0 : (parts[0] ?? 0),
      opponentScore: isNaN(parts[1] ?? NaN) ? 0 : (parts[1] ?? 0),
    };
  });
}

// ─── Sub-component: StepButton ────────────────────────────────────────────────

function StepButton({ icon, onPress }: { icon: 'add' | 'remove'; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
    >
      <Ionicons name={icon === 'add' ? 'add' : 'remove'} size={20} color="#0F172A" />
    </Pressable>
  );
}

// ─── Sub-component: SetRow ────────────────────────────────────────────────────

type SetRowProps = {
  set: ScoreSet;
  index: number;
  canRemove: boolean;
  onRemove: (id: number) => void;
  onChange: (id: number, side: 'hostScore' | 'opponentScore', delta: number) => void;
};

function SetRow({ set, index, canRemove, onRemove, onChange }: SetRowProps) {
  return (
    <Animated.View
      entering={FADE_DOWN}
      exiting={FadeOutUp.duration(180)}
      layout={LAYOUT}
      style={styles.setCard}
    >
      <View style={styles.setCardHeader}>
        <Text style={styles.setCardLabel}>{index + 1}. Set</Text>
        {canRemove && (
          <TouchableOpacity
            onPress={() => onRemove(set.id)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            activeOpacity={0.6}
          >
            <Ionicons name="close-circle-outline" size={19} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.stepperRow}>
        <View style={styles.scoreCell}>
          <StepButton icon="remove" onPress={() => onChange(set.id, 'hostScore', -1)} />
          <Text style={styles.scoreDigit}>{set.hostScore}</Text>
          <StepButton icon="add"    onPress={() => onChange(set.id, 'hostScore', +1)} />
        </View>
        <Text style={styles.scoreSep}>—</Text>
        <View style={styles.scoreCell}>
          <StepButton icon="remove" onPress={() => onChange(set.id, 'opponentScore', -1)} />
          <Text style={styles.scoreDigit}>{set.opponentScore}</Text>
          <StepButton icon="add"    onPress={() => onChange(set.id, 'opponentScore', +1)} />
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MatchDetailsModal({
  isVisible,
  match,
  bookingDetails,
  onClose,
}: MatchDetailsModalProps) {
  const { uid } = useAuth();

  const nextSetId = useRef(1);

  const [profiles,         setProfiles]         = useState<Record<string, UserProfile>>({});
  const [removingUid,      setRemovingUid]      = useState<string | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [sets,             setSets]             = useState<ScoreSet[]>([{ id: 0, hostScore: 0, opponentScore: 0 }]);
  const [isSubmitting,     setIsSubmitting]     = useState(false);
  const [isEditingScore,   setIsEditingScore]   = useState(false);
  const [isCancelling,     setIsCancelling]     = useState(false);
  const [isLeaving,        setIsLeaving]        = useState(false);

  const isHost     = match.hostId === uid;
  const isFull     = match.status === 'FULL';
  const skillColor = SKILL_COLOR[match.skillLevel];
  const skillLabel = SKILL_LABEL[match.skillLevel];

  // ── Past/future detection ────────────────────────────────────────────────
  const { isMatchInPast, hoursUntilMatch } = useMemo(() => {
    const [year, month, day] = match.date.split('-').map(Number);
    const [hour, minute]     = match.slotTime.split(':').map(Number);
    const matchMs = new Date(year, month - 1, day, hour, minute).getTime();
    return {
      isMatchInPast:   matchMs < Date.now(),
      hoursUntilMatch: (matchMs - Date.now()) / (1000 * 60 * 60),
    };
  }, [match.date, match.slotTime]);

  const showScoreEntry   = (isMatchInPast && !match.isScored && isHost && match.joinedPlayers.length >= 2) || isEditingScore;
  const showScoreResult  = !!match.isScored && !isEditingScore;
  const showCancelButton = !isMatchInPast && isHost && !match.isScored;

  // Participant (non-host) can leave; locked within 12 h of start
  const showLeaveButton = !isHost && !isMatchInPast && match.joinedPlayers.includes(uid);
  const isLeaveLocked   = hoursUntilMatch < LEAVE_LOCK_HOURS;

  // ── Derived score string ──────────────────────────────────────────────────
  const scoreString = sets.map((s) => `${s.hostScore}-${s.opponentScore}`).join(', ');
  const canSave     = selectedWinnerId !== null &&
    sets.some((s) => s.hostScore > 0 || s.opponentScore > 0);

  // ── Reset form when match changes ─────────────────────────────────────────
  useEffect(() => {
    setSelectedWinnerId(null);
    setSets([{ id: 0, hostScore: 0, opponentScore: 0 }]);
    nextSetId.current = 1;
    setIsSubmitting(false);
    setIsEditingScore(false);
    setIsLeaving(false);
  }, [match.id]);

  // ── Reset editing flag when modal closes ──────────────────────────────────
  useEffect(() => {
    if (!isVisible) setIsEditingScore(false);
  }, [isVisible]);

  // ── Fetch player profiles ─────────────────────────────────────────────────
  const playersKey = match.joinedPlayers.join(',');
  useEffect(() => {
    if (!isVisible) return;
    const uids     = [...match.joinedPlayers];
    const uncached = uids.filter((id) => !profileCache.has(id));
    const apply    = () => {
      const out: Record<string, UserProfile> = {};
      for (const id of uids) { const p = profileCache.get(id); if (p) out[id] = p; }
      setProfiles(out);
    };
    if (uncached.length === 0) { apply(); return; }
    Promise.all(uncached.map(resolveProfile)).then(apply).catch(apply);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, match.id, playersKey]);

  // ── Set management ────────────────────────────────────────────────────────
  const handleAddSet = useCallback(() => {
    setSets((prev) =>
      prev.length < MAX_SETS
        ? [...prev, { id: nextSetId.current++, hostScore: 0, opponentScore: 0 }]
        : prev,
    );
  }, []);

  const handleRemoveSet = useCallback((id: number) => {
    setSets((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }, []);

  const handleScoreChange = useCallback(
    (id: number, side: 'hostScore' | 'opponentScore', delta: number) => {
      setSets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [side]: clamp(s[side] + delta) } : s)),
      );
    },
    [],
  );

  // ── Enter edit mode — pre-load existing score ─────────────────────────────
  const handleEditScore = useCallback(() => {
    if (!match.score) return;
    const parsed = parseSets(match.score, nextSetId.current);
    nextSetId.current += parsed.length;
    setSets(parsed.length > 0 ? parsed : [{ id: nextSetId.current++, hostScore: 0, opponentScore: 0 }]);
    setSelectedWinnerId(match.winnerId ?? null);
    setIsEditingScore(true);
  }, [match.score, match.winnerId]);

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
                Alert.alert('Hata', error instanceof Error ? error.message : 'Oyuncu çıkarılamadı.');
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

  // ── Cancel listing ────────────────────────────────────────────────────────
  const handleCancelListing = useCallback(() => {
    Alert.alert(
      'İlanı Kaldır',
      'Oyuncu ilanını kaldırmak istediğinize emin misiniz?\n\nKort rezervasyonunuz etkilenmeyecektir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Kaldır',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              await cancelMatchListing(match.id, uid);
              onClose();
            } catch (error) {
              Alert.alert('Hata', error instanceof Error ? error.message : 'İlan kaldırılamadı.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  }, [match.id, uid, onClose]);

  // ── Leave match (participant only) ────────────────────────────────────────
  const handleLeaveMatch = useCallback(() => {
    if (isLeaveLocked) {
      Alert.alert(
        '🚨 Güvenlik Kilidi',
        `Maça ${LEAVE_LOCK_HOURS} saatten az kaldığı için ayrılamazsınız. ` +
        'Lütfen acil durumlar için ev sahibiyle iletişime geçin.',
        [{ text: 'Anladım', style: 'default' }],
      );
      return;
    }
    Alert.alert(
      'Maçtan Ayrıl',
      'Bu maçtan ayrılmak istediğinize emin misiniz?\nKontenjan tekrar açılacaktır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Ayrıl',
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await leaveMatch(match.id, uid);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onClose();
            } catch (error) {
              Alert.alert('Hata', error instanceof Error ? error.message : 'Ayrılma işlemi başarısız.');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ],
    );
  }, [isLeaveLocked, match.id, uid, onClose]);

  // ── Submit / update score ─────────────────────────────────────────────────
  const handleSubmitScore = useCallback(async () => {
    if (!selectedWinnerId || !canSave) return;
    const loserIds = match.joinedPlayers.filter((id) => id !== selectedWinnerId);
    if (loserIds.length === 0) { Alert.alert('Hata', 'Kaybeden oyuncu bulunamadı.'); return; }

    setIsSubmitting(true);
    try {
      if (isEditingScore) {
        await updateMatchScore(match.id, scoreString, selectedWinnerId, loserIds);
      } else {
        await submitMatchScore(match.id, scoreString, selectedWinnerId, loserIds);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      Alert.alert('🏆 Skor Kaydedildi!', `Maç skoru: ${scoreString}`);
      setIsEditingScore(false);
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Skor kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  }, [match.id, match.joinedPlayers, selectedWinnerId, canSave, scoreString, isEditingScore]);

  const emptySlots = Math.max(0, match.requiredPlayers - match.joinedPlayers.length);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop */}
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
        pointerEvents="none"
      />

      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View
          entering={SHEET_ENTER}
          exiting={SHEET_EXIT}
          layout={LAYOUT}
          style={styles.sheet}
        >
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Maç Detayları</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="close-circle" size={26} color="#D1D5DB" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* ── Status + skill ─────────────────────── */}
            <View style={styles.metaRow}>
              <View style={[styles.statusPill, isFull ? styles.statusFull : styles.statusOpen]}>
                <Text style={[styles.statusText, isFull ? styles.statusTextFull : styles.statusTextOpen]}>
                  {isFull ? `${match.joinedPlayers.length}/${match.requiredPlayers} KONTENJAN DOLDU` : 'AÇIK'}
                </Text>
              </View>
              <View style={[styles.skillPill, { backgroundColor: `${skillColor}1A` }]}>
                <View style={[styles.skillDot, { backgroundColor: skillColor }]} />
                <Text style={[styles.skillText, { color: skillColor }]}>{skillLabel}</Text>
              </View>
            </View>

            {/* ── Final score result card ─────────────── */}
            {showScoreResult && (
              <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                layout={LAYOUT}
                style={styles.finalScoreCard}
              >
                <Text style={styles.finalScoreEmoji}>🏆</Text>
                <Text style={styles.finalScoreLabel}>SONUÇ</Text>
                <Text style={styles.finalScoreValue}>{match.score}</Text>
                {isHost && (
                  <TouchableOpacity
                    style={styles.editScoreButton}
                    onPress={handleEditScore}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={14} color="#92400E" style={{ marginRight: 4 }} />
                    <Text style={styles.editScoreButtonText}>Düzenle</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}

            {/* ── Booking info ────────────────────────── */}
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

            {/* ── Players ─────────────────────────────── */}
            <Text style={styles.sectionLabel}>Oyuncular</Text>

            <View style={styles.playerList}>
              {match.joinedPlayers.map((playerUid) => {
                const profile       = profiles[playerUid] ?? { initial: (playerUid[0] ?? '?').toUpperCase(), color: avatarColor(playerUid), displayName: null };
                const isPlayerHost  = playerUid === match.hostId;
                const isCurrentUser = playerUid === uid;
                const canKick       = isHost && !isPlayerHost;
                const isBeingRemoved= removingUid === playerUid;
                const isWinner      = showScoreResult && playerUid === match.winnerId;

                return (
                  <View key={playerUid} style={styles.playerRow}>
                    <View style={styles.playerAvatarWrapper}>
                      <View style={[styles.playerAvatar, { backgroundColor: profile.color }, isWinner && styles.playerAvatarWinner]}>
                        <Text style={styles.playerAvatarInitial}>{profile.initial}</Text>
                      </View>
                      {isPlayerHost && <View style={styles.crownBadge}><Text style={styles.crownText}>👑</Text></View>}
                      {isWinner      && <View style={styles.trophyBadge}><Text style={styles.trophyText}>🏆</Text></View>}
                    </View>

                    <View style={styles.playerInfo}>
                      <View style={styles.playerNameRow}>
                        <Text style={styles.playerRole}>
                          {isPlayerHost ? 'Maç Sahibi' : 'Katılımcı'}{isCurrentUser ? ' · Sen' : ''}
                        </Text>
                        {isWinner && <View style={styles.winnerTag}><Text style={styles.winnerTagText}>Kazanan</Text></View>}
                      </View>
                      <Text style={styles.playerUid} numberOfLines={1}>{playerUid.slice(0, 12)}…</Text>
                    </View>

                    {canKick && !showScoreResult && (
                      <TouchableOpacity
                        disabled={isBeingRemoved}
                        onPress={() => handleKick(playerUid)}
                        style={styles.kickBtn}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        {isBeingRemoved
                          ? <ActivityIndicator size="small" color="#EF4444" />
                          : <Ionicons name="close-circle-outline" size={22} color="#EF4444" />}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {Array.from({ length: emptySlots }, (_, i) => (
                <View key={`empty-${i}`} style={[styles.playerRow, styles.playerRowEmpty]}>
                  <View style={[styles.playerAvatar, styles.playerAvatarEmpty]}>
                    <Ionicons name="add-outline" size={17} color="#CBD5E1" />
                  </View>
                  <Text style={styles.emptySlotText}>Boş yer</Text>
                </View>
              ))}
            </View>

            {/* ── No-keyboard score entry (new + edit mode) ── */}
            {showScoreEntry && (
              <Animated.View
                entering={FADE_DOWN}
                exiting={FadeOutUp.duration(200)}
                layout={LAYOUT}
                style={styles.scoreSection}
              >
                <View style={styles.divider} />
                <View style={styles.scoreSectionHeader}>
                  <Text style={styles.sectionLabel}>
                    {isEditingScore ? 'Skoru Güncelle' : 'Skor Gir'}
                  </Text>
                  {isEditingScore && (
                    <TouchableOpacity
                      onPress={() => setIsEditingScore(false)}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <Text style={styles.cancelEditText}>Vazgeç</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Winner selector */}
                <Text style={styles.scoreSublabel}>Kazanan Oyuncu</Text>
                <View style={styles.winnerPills}>
                  {match.joinedPlayers.map((playerUid) => {
                    const profile    = profiles[playerUid] ?? { initial: (playerUid[0] ?? '?').toUpperCase(), color: avatarColor(playerUid), displayName: null };
                    const isSelected = selectedWinnerId === playerUid;
                    return (
                      <TouchableOpacity
                        key={playerUid}
                        onPress={() => setSelectedWinnerId(playerUid)}
                        style={[styles.winnerPill, isSelected && styles.winnerPillSelected]}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.winnerPillAvatar, { backgroundColor: profile.color }]}>
                          <Text style={styles.winnerPillAvatarText}>{profile.initial}</Text>
                        </View>
                        <Text style={[styles.winnerPillLabel, isSelected && styles.winnerPillLabelSelected]}>
                          {playerUid === match.hostId ? 'Kurucu' : 'Katılımcı'}
                          {playerUid === uid ? ' (Sen)' : ''}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={16} color="#22C55E" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Column headers */}
                <View style={styles.setColumnHeaders}>
                  <Text style={styles.setColumnLabel}>Ev Sahibi</Text>
                  <View style={styles.setColumnSep} />
                  <Text style={styles.setColumnLabel}>Rakip</Text>
                </View>

                {/* Set stepper cards */}
                {sets.map((set, idx) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    index={idx}
                    canRemove={sets.length > 1}
                    onRemove={handleRemoveSet}
                    onChange={handleScoreChange}
                  />
                ))}

                {sets.length < MAX_SETS && (
                  <TouchableOpacity onPress={handleAddSet} style={styles.addSetButton} activeOpacity={0.65}>
                    <Ionicons name="add-circle-outline" size={19} color="#6B7280" />
                    <Text style={styles.addSetText}>Yeni Set Ekle</Text>
                  </TouchableOpacity>
                )}

                {canSave && (
                  <View style={styles.scorePreview}>
                    <Ionicons name="stats-chart-outline" size={13} color="#6B7280" />
                    <Text style={styles.scorePreviewText}>{scoreString}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.saveScoreButton, !canSave && styles.saveScoreButtonDisabled]}
                  disabled={!canSave || isSubmitting}
                  onPress={handleSubmitScore}
                  activeOpacity={0.8}
                >
                  {isSubmitting
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Text style={styles.saveScoreButtonText}>
                        {isEditingScore ? '✏️  Güncelle' : '🏆  Kaydet'}
                      </Text>}
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── Cancel listing (future, unscored, host only) ── */}
            {showCancelButton && (
              <Animated.View
                entering={FadeIn.duration(300)}
                layout={LAYOUT}
              >
                <View style={styles.cancelDivider} />
                <TouchableOpacity
                  style={styles.cancelListingButton}
                  onPress={handleCancelListing}
                  disabled={isCancelling}
                  activeOpacity={0.8}
                >
                  {isCancelling
                    ? <ActivityIndicator color="#EF4444" size="small" />
                    : <>
                        <Ionicons name="close-circle-outline" size={17} color="#EF4444" style={{ marginRight: 7 }} />
                        <Text style={styles.cancelListingText}>İlanı Kaldır</Text>
                      </>}
                </TouchableOpacity>
                <Text style={styles.cancelListingHint}>
                  Rezervasyonunuz korunur — sadece oyuncu ilanı kaldırılır.
                </Text>
              </Animated.View>
            )}

            {/* ── Leave match (future, participant only) ── */}
            {showLeaveButton && (
              <Animated.View
                entering={FadeIn.duration(300)}
                layout={LAYOUT}
              >
                <View style={styles.cancelDivider} />
                <TouchableOpacity
                  style={[
                    styles.leaveButton,
                    isLeaveLocked && styles.leaveButtonLocked,
                  ]}
                  onPress={handleLeaveMatch}
                  disabled={isLeaving}
                  activeOpacity={0.8}
                >
                  {isLeaving ? (
                    <ActivityIndicator
                      color={isLeaveLocked ? '#9CA3AF' : '#F97316'}
                      size="small"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name={isLeaveLocked ? 'lock-closed-outline' : 'exit-outline'}
                        size={16}
                        color={isLeaveLocked ? '#9CA3AF' : '#F97316'}
                        style={{ marginRight: 7 }}
                      />
                      <Text
                        style={[
                          styles.leaveButtonText,
                          isLeaveLocked && styles.leaveButtonTextLocked,
                        ]}
                      >
                        {isLeaveLocked
                          ? `🔒 Maçtan Ayrıl (Kilitli)`
                          : 'Maçtan Ayrıl'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.leaveHint}>
                  {isLeaveLocked
                    ? `Maça ${LEAVE_LOCK_HOURS} saatten az kaldığı için ayrılamazsınız`
                    : 'Ayrılmanız durumunda kontenjan tekrar açılacaktır'}
                </Text>
              </Animated.View>
            )}
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
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 44,
    maxHeight: '90%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center', width: 42, height: 5,
    borderRadius: 3, backgroundColor: '#E2E8F0', marginBottom: 18,
  },

  // ── Sheet header ─────────────────────────────────────────────────────────
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', letterSpacing: -0.4 },

  // ── Status + skill ────────────────────────────────────────────────────────
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusOpen: { backgroundColor: '#DCFCE7' },
  statusFull: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusTextOpen: { color: '#15803D' },
  statusTextFull: { color: '#92400E' },
  skillPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 5 },
  skillDot:  { width: 6, height: 6, borderRadius: 3 },
  skillText: { fontSize: 12, fontWeight: '700' },

  // ── Final score card ──────────────────────────────────────────────────────
  finalScoreCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 18,
    gap: 4,
  },
  finalScoreEmoji: { fontSize: 28, marginBottom: 4 },
  finalScoreLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 1.2, textTransform: 'uppercase' },
  finalScoreValue: { fontSize: 26, fontWeight: '800', color: '#78350F', letterSpacing: -0.5, marginTop: 2 },
  editScoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(146, 64, 14, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(146, 64, 14, 0.18)',
  },
  editScoreButtonText: { fontSize: 13, fontWeight: '600', color: '#92400E' },

  // ── Info card ─────────────────────────────────────────────────────────────
  infoCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, gap: 10, marginBottom: 20 },
  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, fontWeight: '500', color: '#374151', flex: 1 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginBottom: 18 },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 14,
  },

  // ── Player list ───────────────────────────────────────────────────────────
  playerList: { gap: 12, marginBottom: 4 },
  playerRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerRowEmpty: { opacity: 0.45 },
  playerAvatarWrapper: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  playerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  },
  playerAvatarWinner: { borderWidth: 2, borderColor: '#F59E0B' },
  playerAvatarEmpty:  { backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0' },
  playerAvatarInitial: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  crownBadge: {
    position: 'absolute', top: 0, right: 0, width: 17, height: 17, borderRadius: 9,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
    alignItems: 'center', justifyContent: 'center',
  },
  crownText:  { fontSize: 8, lineHeight: 10 },
  trophyBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    alignItems: 'center', justifyContent: 'center',
  },
  trophyText: { fontSize: 9, lineHeight: 11 },
  playerInfo: { flex: 1, gap: 2 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerRole: { fontSize: 14, fontWeight: '600', color: '#111827' },
  winnerTag:  { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  winnerTagText: { fontSize: 10, fontWeight: '700', color: '#78350F' },
  playerUid:  { fontSize: 12, color: '#9CA3AF', fontWeight: '400' },
  emptySlotText: { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  kickBtn:    { padding: 4 },

  // ── Score section ─────────────────────────────────────────────────────────
  scoreSection: { marginTop: 8 },
  scoreSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cancelEditText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
  scoreSublabel:  { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 10, marginTop: 4 },

  winnerPills: { gap: 8, marginBottom: 20 },
  winnerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  winnerPillSelected:      { borderColor: '#22C55E', backgroundColor: '#F0FDF4' },
  winnerPillAvatar:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  winnerPillAvatarText:    { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  winnerPillLabel:         { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151' },
  winnerPillLabelSelected: { color: '#15803D', fontWeight: '600' },

  setColumnHeaders: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  setColumnLabel:   { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },
  setColumnSep:     { width: 32 },

  // Set card
  setCard: {
    backgroundColor: '#F8FAFC', borderRadius: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
  },
  setCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  setCardLabel:  { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  scoreCell:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  scoreSep:   { width: 28, textAlign: 'center', fontSize: 18, fontWeight: '300', color: '#CBD5E1' },
  scoreDigit: { fontSize: 32, fontWeight: '800', color: '#0F172A', minWidth: 36, textAlign: 'center', letterSpacing: -1 },

  stepBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  stepBtnPressed: { backgroundColor: '#F1F5F9', borderColor: '#D1D5DB' },

  addSetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed', marginBottom: 16,
  },
  addSetText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },

  scorePreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 },
  scorePreviewText: { fontSize: 13, fontWeight: '600', color: '#6B7280', letterSpacing: 0.3 },

  saveScoreButton: {
    backgroundColor: '#0F172A', borderRadius: 16, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4,
    marginBottom: 4,
  },
  saveScoreButtonDisabled: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  saveScoreButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  // ── Cancel listing ─────────────────────────────────────────────────────────
  cancelDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginBottom: 20 },
  cancelListingButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    marginBottom: 10,
  },
  cancelListingText: { fontSize: 14, fontWeight: '700', color: '#EF4444', letterSpacing: 0.2 },
  cancelListingHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, marginBottom: 8 },

  // ── Leave match ──────────────────────────────────────────────────────────
  leaveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
    marginBottom: 10,
  },
  leaveButtonLocked: {
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  leaveButtonText: { fontSize: 14, fontWeight: '700', color: '#F97316', letterSpacing: 0.2 },
  leaveButtonTextLocked: { color: '#9CA3AF' },
  leaveHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, marginBottom: 8 },
});
