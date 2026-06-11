import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { COURTS } from '../config/courts';
import { publishMatch } from '../services/matchService';
import type { ConfirmedBooking } from '../types/booking';
import type { SkillLevel } from '../types/match';

// ─── Option data ──────────────────────────────────────────────────────────────

type SkillOption = { value: SkillLevel; label: string; color: string };

const SKILL_OPTIONS: SkillOption[] = [
  { value: 'BEGINNER',     label: 'Başlangıç',   color: '#22C55E' },
  { value: 'INTERMEDIATE', label: 'Orta Seviye',  color: '#3B82F6' },
  { value: 'ADVANCED',     label: 'İleri Seviye', color: '#F97316' },
];

/** Total-player options (host is always included). */
const PLAYER_OPTIONS = [2, 3, 4] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatModalDate(dateKey: string, slotTime: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const label = new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
  return `${label} · ${slotTime}`;
}

function resolveCourtName(courtId: string): string {
  return COURTS.find((c) => c.id === courtId)?.name ?? courtId;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type PublishMatchModalProps = {
  isVisible: boolean;
  onClose: () => void;
  booking: ConfirmedBooking;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PublishMatchModal({
  isVisible,
  onClose,
  booking,
}: PublishMatchModalProps) {
  const { uid } = useAuth();

  const [skillLevel, setSkillLevel]         = useState<SkillLevel>('INTERMEDIATE');
  const [requiredPlayers, setRequiredPlayers] = useState<2 | 3 | 4>(3);
  const [isPublishing, setIsPublishing]     = useState(false);

  // Reset form each time the modal opens so it always starts fresh
  useEffect(() => {
    if (!isVisible) return;
    setSkillLevel('INTERMEDIATE');
    setRequiredPlayers(3);
    setIsPublishing(false);
  }, [isVisible]);

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    try {
      await publishMatch({
        bookingId:       booking.id,
        hostId:          uid,
        courtId:         booking.courtId,
        date:            booking.date,
        slotTime:        booking.slotTime,
        requiredPlayers,
        skillLevel,
      });
      Alert.alert(
        '🎾 İlan Yayınlandı!',
        'Maç ilanınız Lobi ekranında aktif. Oyuncular artık katılabilir.',
        [{ text: 'Harika!', onPress: onClose }],
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'İlan yayınlanamadı.';
      Alert.alert('Hata', msg);
      setIsPublishing(false);
    }
  }, [booking, uid, requiredPlayers, skillLevel, onClose]);

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
        {/* Tap-to-dismiss area above the sheet */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        {/* ── Animated bottom sheet — slides up with spring bounce ── */}
        <Animated.View
          entering={SlideInDown.springify().mass(0.3).damping(18).stiffness(120)}
          exiting={SlideOutDown.duration(250)}
          style={styles.sheet}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <Text style={styles.title}>Oyuncu Ara</Text>
          <Text style={styles.bookingInfo}>
            {resolveCourtName(booking.courtId)}
            {'  ·  '}
            {formatModalDate(booking.date, booking.slotTime)}
          </Text>

          <View style={styles.divider} />

          {/* ── Skill level picker ─────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Seviye Seçin</Text>
          <View style={styles.pillRow}>
            {SKILL_OPTIONS.map(({ value, label, color }) => {
              const active = skillLevel === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setSkillLevel(value)}
                  activeOpacity={0.72}
                  style={[
                    styles.pill,
                    active && { backgroundColor: color, borderColor: color },
                  ]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Player count picker ────────────────────────────────── */}
          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            Toplam Oyuncu
          </Text>
          <View style={styles.pillRow}>
            {PLAYER_OPTIONS.map((count) => {
              const active = requiredPlayers === count;
              return (
                <TouchableOpacity
                  key={count}
                  onPress={() => setRequiredPlayers(count)}
                  activeOpacity={0.72}
                  style={[styles.pill, styles.pillWide, active && styles.pillActiveGreen]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {count} Kişi
                  </Text>
                  {count === 2 && (
                    <Text style={[styles.pillSubtext, active && styles.pillSubtextActive]}>
                      Singles
                    </Text>
                  )}
                  {count === 4 && (
                    <Text style={[styles.pillSubtext, active && styles.pillSubtextActive]}>
                      Çiftler
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* ── Publish CTA ────────────────────────────────────────── */}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isPublishing}
            onPress={handlePublish}
            style={[styles.publishButton, isPublishing && styles.publishButtonPending]}
          >
            {isPublishing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.publishButtonText}>🎾  Yayınla</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Modal chrome ────────────────────────────────────────────────────────────
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
    paddingBottom: 40,
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
    marginBottom: 22,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 5,
  },
  bookingInfo: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },

  // ── Section labels ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 4,
  },

  // ── Pill buttons ──────────────────────────────────────────────────────────
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillWide: {
    minHeight: 52,
  },
  pillActiveGreen: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillSubtext: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pillSubtextActive: {
    color: 'rgba(255,255,255,0.75)',
  },

  // ── Publish button ────────────────────────────────────────────────────────
  publishButton: {
    height: 54,
    backgroundColor: '#22C55E',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  publishButtonPending: {
    backgroundColor: '#86EFAC',
    shadowOpacity: 0,
    elevation: 0,
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
