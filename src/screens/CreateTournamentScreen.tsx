/**
 * @file src/screens/CreateTournamentScreen.tsx
 *
 * 4-Step Tournament Creation Wizard.
 * Strictly typed against the discriminated unions in src/types/tournament.ts.
 *
 * Animation strategy
 * ──────────────────
 * Step transitions: single Animated.View (reanimated) with opacity + translateX
 *   shared values.  Navigate: fade/slide out → 160 ms → swap step → fade/slide in.
 * Sub-settings (Step 3): key-based FadeInDown entry — no exiting needed.
 */

import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import { createTournament } from '../services/tournamentService';
import type {
  TierAssignment,
  TieBreakerCriterion,
  TournamentFormat,
  TournamentPaymentMethod,
  TournamentScoringSystem,
  TournamentTab,
  TournamentUpdateFrequency,
  TournamentVisibility,
  TournamentVisibilityLevel,
} from '../types/tournament';

// ─── Wizard-local types ───────────────────────────────────────────────────────

type PeriodicInterval = 'weekly' | 'biweekly' | 'monthly';

type WizardDraft = {
  // Step 1
  title: string;
  format: TournamentFormat;
  type: TournamentTab;
  visibility: TournamentVisibilityLevel;
  paymentMethod: TournamentPaymentMethod;
  entryFeeText: string;
  // Step 2
  setsToWin: number;
  winByTwo: boolean;
  lastSetTieBreak: boolean;
  // Step 3
  scoringSystem: TournamentScoringSystem;
  tierAssignments: TierAssignment[];
  updateFrequency: TournamentUpdateFrequency;
  periodicInterval: PeriodicInterval;
  // Step 4
  visibilityRules: TournamentVisibility;
  tieBreakerPriority: TieBreakerCriterion[];
  hasLegacyData: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_DRAFT: WizardDraft = {
  title: '',
  format: 'Lig+Eleme',
  type: 'Özel',
  visibility: 'public',
  paymentMethod: 'free',
  entryFeeText: '',
  setsToWin: 2,
  winByTwo: false,
  lastSetTieBreak: false,
  scoringSystem: 'classic',
  tierAssignments: [
    { rankStart: 1,  rankEnd: 1,  pointsAssigned: 100 },
    { rankStart: 2,  rankEnd: 5,  pointsAssigned: 60  },
    { rankStart: 6,  rankEnd: 10, pointsAssigned: 30  },
  ],
  updateFrequency: 'dynamic',
  periodicInterval: 'weekly',
  visibilityRules: {
    showPowerPoints:   true,
    showMatchesPlayed: true,
    showWins:          true,
    showGamesWon:      true,
  },
  tieBreakerPriority: ['head_to_head', 'set_difference', 'game_difference', 'power_points'],
  hasLegacyData: false,
};

const STEP_TITLES = [
  'Temel Bilgiler',
  'Maç Kuralları',
  'Puanlama Sistemi',
  'Görünürlük & Eşitlik',
] as const;

const TOTAL_STEPS = STEP_TITLES.length;

/**
 * The custom floating tab bar sits at bottom:24 with height:68.
 * Its top edge is 92 px from the screen bottom — we must clear that.
 */
const TAB_CLEARANCE = 92;

// ─── Option arrays ────────────────────────────────────────────────────────────

type Opt<T extends string> = { label: string; value: T };

const TYPE_OPTS: Opt<TournamentTab>[] = [
  { label: 'Lig',  value: 'Lig'  },
  { label: 'Defi', value: 'Defi' },
  { label: 'Özel', value: 'Özel' },
];

const FORMAT_OPTS: Opt<TournamentFormat>[] = [
  { label: 'Eleme',     value: 'Eleme'     },
  { label: 'Lig',       value: 'Lig'       },
  { label: 'Lig+Eleme', value: 'Lig+Eleme' },
];

const PAYMENT_OPTS: Opt<TournamentPaymentMethod>[] = [
  { label: 'Ücretsiz',     value: 'free'   },
  { label: 'Uygulama İçi', value: 'in_app' },
  { label: 'Manuel',       value: 'manual' },
];

const VISIBILITY_OPTS: Opt<TournamentVisibilityLevel>[] = [
  { label: 'Herkese Açık', value: 'public'  },
  { label: 'Gizli',        value: 'private' },
];

const SCORING_OPTS: Opt<TournamentScoringSystem>[] = [
  { label: 'Klasik', value: 'classic' },
  { label: 'Özel',   value: 'custom'  },
];

const FREQ_OPTS: Opt<TournamentUpdateFrequency>[] = [
  { label: 'Dinamik',   value: 'dynamic'  },
  { label: 'Periyodik', value: 'periodic' },
  { label: 'Manuel',    value: 'manual'   },
];

const PERIODIC_OPTS: Opt<PeriodicInterval>[] = [
  { label: 'Haftalık',        value: 'weekly'   },
  { label: 'İki Haftada Bir', value: 'biweekly' },
  { label: 'Aylık',           value: 'monthly'  },
];

const TIEBREAKER_LABELS: Record<TieBreakerCriterion, string> = {
  head_to_head:    'Kafa Kafaya',
  set_difference:  'Set Farkı',
  game_difference: 'Oyun Farkı',
  power_points:    'Güç Puanı',
};

const VIS_KEYS: (keyof TournamentVisibility)[] = [
  'showPowerPoints',
  'showMatchesPlayed',
  'showWins',
  'showGamesWon',
];

const VIS_LABELS: Record<keyof TournamentVisibility, string> = {
  showPowerPoints:   'Güç Puanları',
  showMatchesPlayed: 'Oynanan Maçlar',
  showWins:          'Galibiyetler',
  showGamesWon:      'Kazanılan Oyunlar',
};

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    // Root
    root: { flex: 1, backgroundColor: c.background.secondary },

    // ── Header ──────────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text.primary,
      letterSpacing: -0.3,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.surface.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Step indicator ───────────────────────────────────────────────────────
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 8,
    },
    stepDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    stepConnector: {
      flex: 1,
      height: 2,
      marginHorizontal: 4,
    },

    // ── Step heading ─────────────────────────────────────────────────────────
    stepHeading: { paddingHorizontal: 24, paddingBottom: 12 },
    stepHeadingTitle: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    stepHeadingSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },

    // ── Animated content area ────────────────────────────────────────────────
    animView: { flex: 1 },

    // ── ScrollView content ───────────────────────────────────────────────────
    scroll: { paddingHorizontal: 20, paddingTop: 4 },

    // ── Section card ─────────────────────────────────────────────────────────
    section: {
      backgroundColor: c.surface.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      marginBottom: 12,
      gap: 12,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.9,
    },
    hint: {
      fontSize: 12,
      fontWeight: '500',
      color: c.text.muted,
      lineHeight: 18,
    },

    // ── TextInput ────────────────────────────────────────────────────────────
    input: {
      backgroundColor: c.background.primary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border.default,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      fontWeight: '500',
      color: c.text.primary,
    },

    // ── Pill selector ────────────────────────────────────────────────────────
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border.default,
      backgroundColor: c.background.primary,
    },
    pillActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
    pillText: { fontSize: 14, fontWeight: '600', color: c.text.muted },
    pillTextActive: { color: c.text.inverse },

    // ── Divider ──────────────────────────────────────────────────────────────
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border.default },

    // ── Switch row ───────────────────────────────────────────────────────────
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    switchLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: c.text.primary,
      flex: 1,
      paddingRight: 14,
    },

    // ── Stepper ──────────────────────────────────────────────────────────────
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stepperLabel: { fontSize: 15, fontWeight: '500', color: c.text.primary, flex: 1 },
    stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepperBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.surface.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBtnDisabled: { opacity: 0.3 },
    stepperValue: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text.primary,
      width: 30,
      textAlign: 'center',
    },

    // ── Tier builder ─────────────────────────────────────────────────────────
    tierHeaderRow: {
      flexDirection: 'row',
      paddingHorizontal: 6,
      gap: 6,
      marginBottom: -4,
    },
    tierHeaderSpacer:       { width: 22 },
    tierHeaderLabel:        { flex: 1, fontSize: 10, fontWeight: '600', color: c.text.muted, textAlign: 'center' },
    tierHeaderDeleteSpacer: { width: 28 },
    tierRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.background.primary,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      padding: 8,
    },
    tierIdx: { width: 22, fontSize: 12, fontWeight: '700', color: c.text.muted, textAlign: 'center' },
    tierInput: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.text.primary,
      textAlign: 'center',
      backgroundColor: c.surface.card,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      paddingVertical: 5,
      paddingHorizontal: 4,
      minHeight: 32,
    },
    tierDelBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: c.background.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTierBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.border.default,
      paddingVertical: 11,
    },
    addTierText: { fontSize: 13, fontWeight: '600', color: c.text.muted },

    // ── Info / warning rows ──────────────────────────────────────────────────
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      padding: 12,
    },
    infoText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
    warningTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
    warningBody:  { fontSize: 12, fontWeight: '500', lineHeight: 17 },

    // ── Private-invite hint ──────────────────────────────────────────────────
    privateHintBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 12,
      padding: 12,
    },
    privateHintText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 },

    // ── Step 4 — visibility toggles ──────────────────────────────────────────
    visRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    visLabel: { fontSize: 14, fontWeight: '500', color: c.text.primary },

    // ── Step 4 — tie-breaker list ────────────────────────────────────────────
    tbRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    tbRank:       { width: 22, fontSize: 13, fontWeight: '700', color: c.text.muted },
    tbLabel:      { flex: 1, fontSize: 14, fontWeight: '500', color: c.text.primary },
    chevronBtns:  { gap: 4 },
    chevronBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: c.surface.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chevronBtnDisabled: { opacity: 0.25 },

    // ── Bottom navigation bar ────────────────────────────────────────────────
    // paddingBottom clears the floating tab bar (bottom:24 + height:68 + gap:8)
    bottomBar: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: TAB_CLEARANCE + 8,
      backgroundColor: c.background.secondary,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border.default,
    },
    bottomButtons: { flexDirection: 'row', gap: 10 },
    barBackBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 14,
      paddingVertical: 15,
      backgroundColor: c.surface.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border.default,
    },
    barBackBtnText: { fontSize: 15, fontWeight: '600', color: c.text.primary },
    barNextBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 15,
      backgroundColor: c.accent.primary,
      shadowColor: c.accent.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 4,
    },
    barNextBtnText: { fontSize: 15, fontWeight: '700', color: c.text.inverse },
  });
}

// ─── PillSelector ─────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: Opt<T>[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const { theme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors), [theme]);

  return (
    <View style={S.pillRow}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[S.pill, active && S.pillActive]}
            onPress={() => { Haptics.selectionAsync(); onSelect(opt.value); }}
            activeOpacity={0.75}
          >
            <Text style={[S.pillText, active && S.pillTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CreateTournamentScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { uid }    = useAuth();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const S          = useMemo(() => makeStyles(c), [theme]);

  const [step,        setStep]        = useState(0);
  const [draft,       setDraft]       = useState<WizardDraft>(INITIAL_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const patch = useCallback(<K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
  }, []);

  // ── Step transition animation ──────────────────────────────────────────────

  const opacity     = useSharedValue(1);
  const translateX  = useSharedValue(0);
  const inTransit   = useRef(false);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const navigate = useCallback((dir: 1 | -1) => {
    if (inTransit.current) return;
    inTransit.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Fade + slide out
    opacity.value    = withTiming(0,         { duration: 130 });
    translateX.value = withTiming(-dir * 48, { duration: 130 });

    setTimeout(() => {
      setStep(s => s + dir);
      translateX.value = dir * 48;                // jump to enter edge (instant)
      opacity.value    = withTiming(1, { duration: 130 });
      translateX.value = withTiming(0, { duration: 130 });
      setTimeout(() => { inTransit.current = false; }, 140);
    }, 160);
  }, [opacity, translateX]);

  // ── Validation + submission ────────────────────────────────────────────────

  const handleNext = useCallback(async () => {
    // ── Step 1 validation ────────────────────────────────────────────────────
    if (step === 0) {
      if (!draft.title.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Eksik Bilgi', 'Lütfen turnuva başlığını girin.');
        return;
      }
      if (draft.paymentMethod !== 'free') {
        const fee = parseFloat(draft.entryFeeText.replace(',', '.'));
        if (isNaN(fee) || fee <= 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Geçersiz Ücret', 'Lütfen geçerli bir katılım ücreti girin.');
          return;
        }
      }
    }

    // ── Step 3 validation ────────────────────────────────────────────────────
    if (step === 2 && draft.scoringSystem === 'custom' && draft.tierAssignments.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Eksik Konfigürasyon', 'En az bir puan kademesi ekleyin.');
      return;
    }

    if (step < TOTAL_STEPS - 1) {
      navigate(1);
      return;
    }

    // ── Final step: guard, build payload, persist ─────────────────────────────
    if (!uid) {
      Alert.alert('Hata', 'Turnuva oluşturmak için giriş yapmanız gerekiyor.');
      return;
    }

    const fee = parseFloat(draft.entryFeeText.replace(',', '.'));

    const payload: Omit<import('../types/tournament').Tournament, 'id' | 'createdAt'> = {
      title:              draft.title.trim(),
      type:               draft.type,
      format:             draft.format,
      visibility:         draft.visibility,
      organizerId:        uid,
      status:             'upcoming',
      matchRules: {
        setsToWin:       draft.setsToWin,
        winByTwo:        draft.winByTwo,
        lastSetTieBreak: draft.lastSetTieBreak,
      },
      tieBreakerPriority: draft.tieBreakerPriority,
      visibilityRules:    draft.visibilityRules,
      hasLegacyData:      draft.hasLegacyData,

      // Payment discriminated union
      ...(draft.paymentMethod === 'free'
        ? { paymentMethod: 'free' as const }
        : { paymentMethod: draft.paymentMethod, entryFee: fee }),

      // Scoring discriminated union
      ...(draft.scoringSystem === 'classic'
        ? { scoringSystem: 'classic' as const }
        : {
            scoringSystem: 'custom' as const,
            powerPointConfig: {
              maxPointTypes:   draft.tierAssignments.length,
              tierAssignments: draft.tierAssignments,
              updateFrequency: draft.updateFrequency,
            },
          }),
    };

    setIsSubmitting(true);
    try {
      await createTournament(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Hata',
        error instanceof Error ? error.message : 'Turnuva oluşturulamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [step, draft, uid, navigate, navigation]);

  // ── Step 1 ────────────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <>
        <View style={S.section}>
          <Text style={S.sectionLabel}>Turnuva Başlığı</Text>
          <TextInput
            style={S.input}
            value={draft.title}
            onChangeText={v => patch('title', v)}
            placeholder="ör. İstanbul Yaz Kupası 2026"
            placeholderTextColor={c.text.muted}
            maxLength={60}
            returnKeyType="done"
          />
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>Format</Text>
          <PillSelector
            options={FORMAT_OPTS}
            selected={draft.format}
            onSelect={v => patch('format', v)}
          />
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>Turnuva Tipi</Text>
          <PillSelector
            options={TYPE_OPTS}
            selected={draft.type}
            onSelect={v => patch('type', v)}
          />
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>Görünürlük</Text>
          <PillSelector
            options={VISIBILITY_OPTS}
            selected={draft.visibility}
            onSelect={v => patch('visibility', v)}
          />
          {draft.visibility === 'private' && (
            <View style={[S.privateHintBox, { backgroundColor: c.accent.primary + '14' }]}>
              <Ionicons name="lock-closed-outline" size={16} color={c.accent.primary} style={{ marginTop: 1 }} />
              <Text style={[S.privateHintText, { color: c.text.muted }]}>
                Gizli turnuvanız için davet kodunuz, turnuva oluşturulduktan sonra sistem tarafından otomatik olarak atanacaktır.
              </Text>
            </View>
          )}
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>Ödeme Yöntemi</Text>
          <PillSelector
            options={PAYMENT_OPTS}
            selected={draft.paymentMethod}
            onSelect={v => patch('paymentMethod', v)}
          />
          {draft.paymentMethod !== 'free' && (
            <>
              <View style={S.divider} />
              <Text style={S.sectionLabel}>Katılım Ücreti (₺)</Text>
              <TextInput
                style={S.input}
                value={draft.entryFeeText}
                onChangeText={v => patch('entryFeeText', v)}
                placeholder="0.00"
                placeholderTextColor={c.text.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </>
          )}
        </View>
      </>
    );
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────

  function renderStep2() {
    return (
      <>
        <View style={S.section}>
          <Text style={S.sectionLabel}>Kazanılması Gereken Set</Text>
          <Text style={S.hint}>Maçı kazanmak için oynanması gereken set sayısı (1–5).</Text>
          <View style={S.stepperRow}>
            <Text style={S.stepperLabel}>Set Sayısı</Text>
            <View style={S.stepperControls}>
              <TouchableOpacity
                style={[S.stepperBtn, draft.setsToWin <= 1 && S.stepperBtnDisabled]}
                onPress={() => {
                  if (draft.setsToWin <= 1) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  patch('setsToWin', draft.setsToWin - 1);
                }}
                activeOpacity={0.7}
                disabled={draft.setsToWin <= 1}
              >
                <Ionicons name="remove" size={18} color={c.text.primary} />
              </TouchableOpacity>

              <Text style={S.stepperValue}>{draft.setsToWin}</Text>

              <TouchableOpacity
                style={[S.stepperBtn, draft.setsToWin >= 5 && S.stepperBtnDisabled]}
                onPress={() => {
                  if (draft.setsToWin >= 5) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  patch('setsToWin', draft.setsToWin + 1);
                }}
                activeOpacity={0.7}
                disabled={draft.setsToWin >= 5}
              >
                <Ionicons name="add" size={18} color={c.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={S.section}>
          <Text style={S.sectionLabel}>Maç Kuralları</Text>
          <View style={S.switchRow}>
            <Text style={S.switchLabel}>İki Fark Kuralı</Text>
            <Switch
              value={draft.winByTwo}
              onValueChange={v => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                patch('winByTwo', v);
              }}
              trackColor={{ false: c.border.default, true: c.accent.primary }}
              thumbColor={c.text.inverse}
            />
          </View>
          <View style={S.divider} />
          <View style={S.switchRow}>
            <Text style={S.switchLabel}>Son Set Tie-Break</Text>
            <Switch
              value={draft.lastSetTieBreak}
              onValueChange={v => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                patch('lastSetTieBreak', v);
              }}
              trackColor={{ false: c.border.default, true: c.accent.primary }}
              thumbColor={c.text.inverse}
            />
          </View>
        </View>
      </>
    );
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────

  function renderStep3() {
    const isCustom = draft.scoringSystem === 'custom';

    return (
      <>
        <View style={S.section}>
          <Text style={S.sectionLabel}>Sistem</Text>
          <PillSelector
            options={SCORING_OPTS}
            selected={draft.scoringSystem}
            onSelect={v => patch('scoringSystem', v)}
          />
          {!isCustom && (
            <Text style={S.hint}>
              Klasik modda yalnızca galibiyet/mağlubiyet sayılır. Sıralama standart karşılaştırıcılarla belirlenir.
            </Text>
          )}
        </View>

        {isCustom && (
          <>
            {/* ── Tier list builder ─────────────────────────────────────── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>Puan Kademeleri</Text>
              <Text style={S.hint}>
                Sıralama aralıklarına güç puanı atayın. Maksimum 10 kademe.
              </Text>

              {draft.tierAssignments.length > 0 && (
                <View style={S.tierHeaderRow}>
                  <View style={S.tierHeaderSpacer} />
                  <Text style={S.tierHeaderLabel}>Başlangıç</Text>
                  <Text style={S.tierHeaderLabel}>Bitiş</Text>
                  <Text style={S.tierHeaderLabel}>Puan</Text>
                  <View style={S.tierHeaderDeleteSpacer} />
                </View>
              )}

              {draft.tierAssignments.map((tier, i) => (
                <View key={i} style={S.tierRow}>
                  <Text style={S.tierIdx}>#{i + 1}</Text>

                  <TextInput
                    style={S.tierInput}
                    value={String(tier.rankStart)}
                    onChangeText={text => {
                      const n = parseInt(text, 10);
                      if (isNaN(n)) return;
                      const next = [...draft.tierAssignments];
                      next[i] = { ...next[i], rankStart: n };
                      patch('tierAssignments', next);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />

                  <TextInput
                    style={S.tierInput}
                    value={String(tier.rankEnd)}
                    onChangeText={text => {
                      const n = parseInt(text, 10);
                      if (isNaN(n)) return;
                      const next = [...draft.tierAssignments];
                      next[i] = { ...next[i], rankEnd: n };
                      patch('tierAssignments', next);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />

                  <TextInput
                    style={S.tierInput}
                    value={String(tier.pointsAssigned)}
                    onChangeText={text => {
                      const n = parseInt(text, 10);
                      if (isNaN(n)) return;
                      const next = [...draft.tierAssignments];
                      next[i] = { ...next[i], pointsAssigned: n };
                      patch('tierAssignments', next);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                  />

                  <TouchableOpacity
                    style={S.tierDelBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      patch('tierAssignments', draft.tierAssignments.filter((_, j) => j !== i));
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={14} color={c.status.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              {draft.tierAssignments.length < 10 && (
                <TouchableOpacity
                  style={S.addTierBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const last = draft.tierAssignments[draft.tierAssignments.length - 1];
                    const newStart = last ? last.rankEnd + 1 : 1;
                    patch('tierAssignments', [
                      ...draft.tierAssignments,
                      { rankStart: newStart, rankEnd: newStart + 4, pointsAssigned: 10 },
                    ]);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={16} color={c.text.muted} />
                  <Text style={S.addTierText}>Kademe Ekle</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Update frequency + sub-settings ───────────────────────── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>Güncelleme Sıklığı</Text>
              <PillSelector
                options={FREQ_OPTS}
                selected={draft.updateFrequency}
                onSelect={v => patch('updateFrequency', v)}
              />

              {/* Key-based entry animation — no exiting needed */}
              <Animated.View
                key={draft.updateFrequency}
                entering={FadeInDown.duration(260)}
              >
                {draft.updateFrequency === 'dynamic' && (
                  <View style={[S.infoRow, { backgroundColor: c.accent.primary + '14' }]}>
                    <Ionicons name="flash-outline" size={18} color={c.accent.primary} />
                    <Text style={[S.infoText, { color: c.text.muted }]}>
                      Sıralama her maç sonucundan sonra otomatik güncellenir.
                    </Text>
                  </View>
                )}

                {draft.updateFrequency === 'periodic' && (
                  <View style={{ gap: 8 }}>
                    <Text style={S.sectionLabel}>Periyot</Text>
                    <PillSelector
                      options={PERIODIC_OPTS}
                      selected={draft.periodicInterval}
                      onSelect={v => patch('periodicInterval', v)}
                    />
                  </View>
                )}

                {draft.updateFrequency === 'manual' && (
                  <View style={{
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: c.status.warning + '14',
                    borderWidth: 1,
                    borderColor: c.status.warning + '40',
                    gap: 6,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="warning-outline" size={18} color={c.status.warning} />
                      <Text style={[S.warningTitle, { color: c.status.warning }]}>Dikkat</Text>
                    </View>
                    <Text style={[S.warningBody, { color: c.text.muted }]}>
                      Puanlar sadece siz 'Güncelle' butonuna bastığınızda manuel olarak hesaplanır.
                    </Text>
                  </View>
                )}
              </Animated.View>
            </View>
          </>
        )}
      </>
    );
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────

  function renderStep4() {
    const tbList = draft.tieBreakerPriority;

    function moveTb(i: number, dir: -1 | 1) {
      const target = i + dir;
      if (target < 0 || target >= tbList.length) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = [...tbList];
      [next[i], next[target]] = [next[target], next[i]];
      patch('tieBreakerPriority', next);
    }

    return (
      <>
        {/* Visibility toggles */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Görünür İstatistikler</Text>
          <Text style={S.hint}>
            Katılımcıların leaderboard'da görebileceği sütunlar. Organizatörler tümünü her zaman görür.
          </Text>
          {VIS_KEYS.map((key, i) => (
            <View key={key}>
              {i > 0 && <View style={S.divider} />}
              <View style={S.visRow}>
                <Text style={S.visLabel}>{VIS_LABELS[key]}</Text>
                <Switch
                  value={draft.visibilityRules[key]}
                  onValueChange={v => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    patch('visibilityRules', { ...draft.visibilityRules, [key]: v });
                  }}
                  trackColor={{ false: c.border.default, true: c.accent.primary }}
                  thumbColor={c.text.inverse}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Tie-breaker priority list */}
        <View style={S.section}>
          <Text style={S.sectionLabel}>Eşitlik Bozma Önceliği</Text>
          <Text style={S.hint}>
            Kriterlerin öncelik sırası. İlk kriter önce uygulanır.
          </Text>
          {tbList.map((criterion, i) => (
            <View key={criterion}>
              {i > 0 && <View style={S.divider} />}
              <View style={S.tbRow}>
                <Text style={S.tbRank}>{i + 1}.</Text>
                <Text style={S.tbLabel}>{TIEBREAKER_LABELS[criterion]}</Text>
                <View style={S.chevronBtns}>
                  <TouchableOpacity
                    style={[S.chevronBtn, i === 0 && S.chevronBtnDisabled]}
                    onPress={() => moveTb(i, -1)}
                    disabled={i === 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-up" size={13} color={c.text.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.chevronBtn, i === tbList.length - 1 && S.chevronBtnDisabled]}
                    onPress={() => moveTb(i, 1)}
                    disabled={i === tbList.length - 1}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-down" size={13} color={c.text.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Legacy data toggle */}
        <View style={S.section}>
          <View style={S.switchRow}>
            <View style={{ flex: 1, paddingRight: 14 }}>
              <Text style={[S.switchLabel, { flex: 0 }]}>Geçmiş Veri İçe Aktarımı</Text>
              <Text style={[S.hint, { marginTop: 4 }]}>
                Önceki sistemden puan tablosunu aktarmak istiyorsanız etkinleştirin.
              </Text>
            </View>
            <Switch
              value={draft.hasLegacyData}
              onValueChange={v => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                patch('hasLegacyData', v);
              }}
              trackColor={{ false: c.border.default, true: c.accent.primary }}
              thumbColor={c.text.inverse}
            />
          </View>
        </View>
      </>
    );
  }

  function renderCurrentStep() {
    switch (step) {
      case 0:  return renderStep1();
      case 1:  return renderStep2();
      case 2:  return renderStep3();
      case 3:  return renderStep4();
      default: return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={S.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[S.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={S.iconBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={c.text.primary} />
        </TouchableOpacity>

        <Text style={S.headerTitle}>Yeni Turnuva</Text>

        {/* Spacer keeps title centred */}
        <View style={S.iconBtn} />
      </View>

      {/* ── Step progress indicator ─────────────────────────────────────────── */}
      <View style={S.stepRow}>
        {Array.from({ length: TOTAL_STEPS * 2 - 1 }, (_, i) => {
          if (i % 2 === 0) {
            // Dot
            const si     = i / 2;
            const done   = si < step;
            const active = si === step;
            return (
              <View
                key={`dot-${si}`}
                style={[S.stepDot, {
                  backgroundColor: done || active ? c.accent.primary : c.surface.card,
                  borderColor:     done || active ? c.accent.primary : c.border.default,
                  opacity: done ? 0.6 : 1,
                }]}
              >
                {done
                  ? <Ionicons name="checkmark" size={12} color={c.text.inverse} />
                  : (
                    <Text style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: active ? c.text.inverse : c.text.muted,
                    }}>
                      {si + 1}
                    </Text>
                  )
                }
              </View>
            );
          }
          // Connector
          const ci   = (i - 1) / 2;
          const done = ci < step;
          return (
            <View
              key={`conn-${ci}`}
              style={[S.stepConnector, {
                backgroundColor: done ? c.accent.primary : c.border.default,
                opacity: done ? 0.6 : 1,
              }]}
            />
          );
        })}
      </View>

      {/* ── Step heading ────────────────────────────────────────────────────── */}
      <View style={S.stepHeading}>
        <Text style={[S.stepHeadingTitle, { color: c.text.primary }]}>
          {STEP_TITLES[step]}
        </Text>
        <Text style={[S.stepHeadingSub, { color: c.text.muted }]}>
          Adım {step + 1} / {TOTAL_STEPS}
        </Text>
      </View>

      {/* ── Animated step content ───────────────────────────────────────────── */}
      <Animated.View style={[S.animView, animStyle]}>
        <ScrollView
          contentContainerStyle={[S.scroll, { paddingBottom: 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderCurrentStep()}
        </ScrollView>
      </Animated.View>

      {/* ── Sticky bottom navigation bar ────────────────────────────────────── */}
      {/* paddingBottom clears the floating tab bar that renders above this screen */}
      <View style={S.bottomBar}>
        <View style={S.bottomButtons}>
          <TouchableOpacity
            style={[S.barBackBtn, step === 0 && { opacity: 0.35 }]}
            onPress={() => step > 0 && navigate(-1)}
            activeOpacity={0.75}
            disabled={step === 0}
          >
            <Ionicons name="chevron-back" size={16} color={c.text.primary} />
            <Text style={S.barBackBtnText}>Geri</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[S.barNextBtn, isSubmitting && { opacity: 0.6 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={c.text.inverse} />
            ) : (
              <>
                <Text style={S.barNextBtnText}>
                  {step === TOTAL_STEPS - 1 ? 'Oluştur' : 'Devam Et'}
                </Text>
                <Ionicons
                  name={step === TOTAL_STEPS - 1 ? 'checkmark-circle-outline' : 'chevron-forward'}
                  size={16}
                  color={c.text.inverse}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
