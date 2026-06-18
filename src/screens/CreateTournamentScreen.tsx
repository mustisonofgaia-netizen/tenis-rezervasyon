import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import type {
  CustomFormat,
  TournamentRules,
  TournamentTab,
} from '../services/tournamentService';
import { createTournament } from '../services/tournamentService';

// ─── Theme ────────────────────────────────────────────────────────────────────

const BG     = '#0f172a';
const CARD   = '#1e293b';
const ACCENT = '#bef264';
const BORDER = '#334155';
const TEXT   = '#f1f5f9';
const MUTED  = '#94a3b8';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIER_DISTRIBUTION = {
  rank1:     80,
  rank2to5:  60,
  rank6to10: 40,
  rest:      20,
} as const;

const TIEBREAKER_DISPLAY = 'Puan  →  Galibiyet  →  Kazanılan Oyun';

// ─── PillSelector ─────────────────────────────────────────────────────────────

type PillOption<T> = { label: string; value: T };

type PillSelectorProps<T extends string> = {
  options:   PillOption<T>[];
  selected:  T;
  onSelect:  (value: T) => void;
};

function PillSelector<T extends string>({
  options,
  selected,
  onSelect,
}: PillSelectorProps<T>) {
  return (
    <View style={f.pillRow}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[f.pill, active && f.pillActive]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.75}
          >
            <Text style={[f.pillText, active && f.pillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Option definitions ───────────────────────────────────────────────────────

const TYPE_OPTIONS: PillOption<TournamentTab>[] = [
  { label: 'Lig',  value: 'Lig'  },
  { label: 'Defi', value: 'Defi' },
  { label: 'Özel', value: 'Özel' },
];

const FORMAT_OPTIONS: PillOption<CustomFormat>[] = [
  { label: 'Eleme',     value: 'Eleme'     },
  { label: 'Lig',       value: 'Lig'       },
  { label: 'Lig+Eleme', value: 'Lig+Eleme' },
];

const INTERVAL_OPTIONS: PillOption<'weekly' | 'monthly'>[] = [
  { label: 'Haftalık', value: 'weekly'  },
  { label: 'Aylık',    value: 'monthly' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CreateTournamentScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid }    = useAuth();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [title,          setTitle]          = useState('');
  const [type,           setType]           = useState<TournamentTab>('Özel');
  const [format,         setFormat]         = useState<CustomFormat>('Lig+Eleme');
  const [entryFeeText,   setEntryFeeText]   = useState('');
  const [updateInterval, setUpdateInterval] = useState<'weekly' | 'monthly'>('weekly');
  const [isSubmitting,   setIsSubmitting]   = useState(false);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      Alert.alert('Eksik Bilgi', 'Lütfen turnuva başlığını girin.');
      return;
    }

    // Accept both ',' and '.' as decimal separators
    const parsedFee = entryFeeText.trim()
      ? parseFloat(entryFeeText.trim().replace(',', '.'))
      : 0;

    if (isNaN(parsedFee) || parsedFee < 0) {
      Alert.alert('Geçersiz Ücret', 'Katılım ücreti geçerli bir sayı olmalıdır.');
      return;
    }

    setIsSubmitting(true);

    try {
      const rules: TournamentRules = {
        powerPoints: {
          basePoints:       100,
          updateInterval,
          tierDistribution: DEFAULT_TIER_DISTRIBUTION,
        },
        matchRule: {
          winnerGetsLosersPoints: true,
          pointsStatic:           true,
          description:            'Galip, rakibinin güç puanını kazanır. Puanlar seçilen aralıkta güncellenir.',
        },
        tieBreaker: ['points', 'wins', 'gamesWon'],
      };

      await createTournament({
        title:       trimmedTitle,
        type,
        format,
        entryFee:    parsedFee,
        rules,
        status:      'active',
        organizerId: uid,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Turnuva Oluşturuldu',
        `"${trimmedTitle}" başarıyla yayınlandı.`,
        [{ text: 'Tamam', onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert(
        'Hata',
        err instanceof Error
          ? err.message
          : 'Turnuva oluşturulamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [title, type, format, entryFeeText, updateInterval, uid, navigation]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={f.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[f.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={f.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={TEXT} />
        </TouchableOpacity>

        <Text style={f.headerTitle}>Yeni Turnuva</Text>

        {/* Spacer keeps title centred */}
        <View style={f.backBtn} />
      </View>

      {/* ── Scrollable form ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          f.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Title ─────────────────────────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Turnuva Başlığı</Text>
          <TextInput
            style={f.input}
            value={title}
            onChangeText={setTitle}
            placeholder="ör. İstanbul Yaz Kupası 2026"
            placeholderTextColor={MUTED}
            maxLength={60}
            returnKeyType="done"
          />
        </View>

        {/* Type ──────────────────────────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Turnuva Tipi</Text>
          <PillSelector
            options={TYPE_OPTIONS}
            selected={type}
            onSelect={setType}
          />
        </View>

        {/* Format ────────────────────────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Format</Text>
          <PillSelector
            options={FORMAT_OPTIONS}
            selected={format}
            onSelect={setFormat}
          />
        </View>

        {/* Entry fee ─────────────────────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Katılım Ücreti (₺)</Text>
          <TextInput
            style={f.input}
            value={entryFeeText}
            onChangeText={setEntryFeeText}
            placeholder="Ücretsiz için boş bırakın"
            placeholderTextColor={MUTED}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
        </View>

        {/* Power Points interval ─────────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Güç Puanı Güncelleme Aralığı</Text>
          <Text style={f.hint}>
            Liderlik tablosu bu aralıkta yeniden hesaplanır.
            Puan dağılımı: 1. → 80 · 2–5. → 60 · 6–10. → 40 · Diğer → 20
          </Text>
          <PillSelector
            options={INTERVAL_OPTIONS}
            selected={updateInterval}
            onSelect={setUpdateInterval}
          />
        </View>

        {/* Tiebreaker — read-only MVP ────────────────────────────────────── */}
        <View style={f.section}>
          <Text style={f.sectionLabel}>Eşitlik Bozma Sırası</Text>
          <View style={f.readOnlyRow}>
            <Ionicons
              name="swap-vertical-outline"
              size={15}
              color={ACCENT}
              style={{ marginRight: 8 }}
            />
            <Text style={f.readOnlyText}>{TIEBREAKER_DISPLAY}</Text>
          </View>
          <Text style={f.hint}>Eşitlik bozma sırası MVP'de sabittir.</Text>
        </View>

        {/* Submit ────────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[f.submitBtn, isSubmitting && f.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={BG} size="small" />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={BG}
                style={{ marginRight: 8 }}
              />
              <Text style={f.submitText}>Turnuvayı Oluştur</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const f = StyleSheet.create({
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    letterSpacing: -0.3,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },

  // ── Section card ──────────────────────────────────────────────────────────
  section: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  hint: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    lineHeight: 18,
    marginTop: -4,
  },

  // ── TextInput ─────────────────────────────────────────────────────────────
  input: {
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '500',
    color: TEXT,
  },

  // ── Pill selector ─────────────────────────────────────────────────────────
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  pillActive: {
    backgroundColor: ACCENT,
    borderColor:     ACCENT,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
  },
  pillTextActive: {
    color: BG,
  },

  // ── Read-only row ─────────────────────────────────────────────────────────
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: BORDER,
  },
  readOnlyText: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
    letterSpacing: 0.3,
    flexShrink: 1,
  },

  // ── Submit button ─────────────────────────────────────────────────────────
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 17,
    marginTop: 6,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '800',
    color: BG,
    letterSpacing: 0.1,
  },
});
