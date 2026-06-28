/**
 * @file src/screens/CreateEditTournamentScreen.tsx
 *
 * Unified 3-step wizard for CREATING and EDITING tournaments.
 *
 *  Step 1 — Basic   : title, type, format, location, dates, visibility, payment
 *  Step 2 — Scoring : system (classic / custom), tiers, update frequency
 *  Step 3 — Rules   : match rules, tie-breaker priority (reorderable), stat visibility
 *
 * Mode detection: if `route.params.tournamentId` is provided, the screen
 * fetches existing data, pre-populates every field, and calls `updateTournament`
 * on submit. Without it, `createTournament` is called instead.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ColorTokens } from '../theme/tokens';
import type {
  TieBreakerCriterion,
  TierAssignment,
  Tournament,
  TournamentFormat,
  TournamentPaymentMethod,
  TournamentTab,
  TournamentUpdateFrequency,
  TournamentVisibility,
} from '../types/tournament';
import {
  createTournament,
  fetchTournamentById,
  updateTournament,
} from '../services/tournamentService';
import type { TournamentStackParamList } from '../navigation/types';

// ─── Navigation / route ───────────────────────────────────────────────────────

type CETRoute = RouteProp<TournamentStackParamList, 'CreateEditTournament'>;
type CETNav   = NativeStackNavigationProp<TournamentStackParamList, 'CreateEditTournament'>;

// ─── Form state types ─────────────────────────────────────────────────────────

type Step1State = {
  title:         string;
  type:          TournamentTab;
  format:        TournamentFormat;
  location:      string;
  startDate:     Date | null;
  endDate:       Date | null;
  visibility:    'public' | 'private';
  inviteCode:    string;
  paymentMethod: TournamentPaymentMethod;
  entryFee:      string;
};

type Step2State = {
  scoringSystem:  'classic' | 'custom';
  maxPointTypes:  number;
  tierAssignments: TierAssignment[];
  updateFrequency: TournamentUpdateFrequency;
};

type Step3State = {
  setsToWin:           number;
  winByTwo:            boolean;
  lastSetTieBreak:     boolean;
  tieBreakerPriority:  TieBreakerCriterion[];
  visibilityRules:     TournamentVisibility;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_S1: Step1State = {
  title:         '',
  type:          'Lig',
  format:        'Lig',
  location:      '',
  startDate:     null,
  endDate:       null,
  visibility:    'public',
  inviteCode:    '',
  paymentMethod: 'free',
  entryFee:      '',
};

const DEFAULT_S2: Step2State = {
  scoringSystem:   'classic',
  maxPointTypes:   3,
  tierAssignments: [
    { rankStart: 1, rankEnd: 1,  pointsAssigned: 100 },
    { rankStart: 2, rankEnd: 5,  pointsAssigned: 60  },
    { rankStart: 6, rankEnd: 10, pointsAssigned: 30  },
  ],
  updateFrequency: 'dynamic',
};

const DEFAULT_S3: Step3State = {
  setsToWin:          2,
  winByTwo:           false,
  lastSetTieBreak:    true,
  tieBreakerPriority: ['head_to_head', 'set_difference', 'game_difference'],
  visibilityRules: {
    showPowerPoints:   true,
    showMatchesPlayed: true,
    showWins:          true,
    showGamesWon:      true,
  },
};

// ─── Style factory ────────────────────────────────────────────────────────────

function makeStyles(c: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background.secondary },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default,
    },
    headerBack: { width: 40, alignItems: 'flex-start' },
    headerTitle: {
      flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center',
      color: c.text.primary, letterSpacing: -0.3,
    },
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      gap: 6,
    },
    stepDot: {
      width: 28, height: 28, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5,
    },
    stepDotActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
    stepDotDone:   { backgroundColor: c.accent.primary + '20', borderColor: c.accent.primary },
    stepDotIdle:   { backgroundColor: c.surface.card, borderColor: c.border.default },
    stepDotText:   { fontSize: 12, fontWeight: '800' },
    stepLine: { flex: 1, height: 2, maxWidth: 32, borderRadius: 2 },
    scroll: { paddingHorizontal: 16, paddingTop: 12 },
    sectionCard: {
      backgroundColor: c.surface.card, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border.default,
      marginBottom: 16, overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default,
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: c.text.muted,
      textTransform: 'uppercase', letterSpacing: 0.8,
    },
    fieldRow: {
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border.default + '80',
    },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: c.text.muted, marginBottom: 5 },
    input: {
      fontSize: 15, fontWeight: '500', color: c.text.primary,
      paddingVertical: 8, paddingHorizontal: 12,
      backgroundColor: c.background.secondary, borderRadius: 10,
      borderWidth: 1, borderColor: c.border.default,
    },
    pillRow: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    pill: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: c.border.default,
      backgroundColor: c.background.secondary,
    },
    pillActive: { backgroundColor: c.accent.primary, borderColor: c.accent.primary },
    pillText:   { fontSize: 13, fontWeight: '600', color: c.text.muted },
    pillTextActive: { color: c.text.inverse },
    switchRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    switchLabel: { fontSize: 14, fontWeight: '500', color: c.text.primary, flex: 1 },
    switchSub:   { fontSize: 12, fontWeight: '400', color: c.text.muted, marginTop: 1 },
    // Tier rows
    tierRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    tierInput: {
      flex: 1, fontSize: 14, fontWeight: '500', color: c.text.primary,
      paddingVertical: 7, paddingHorizontal: 10,
      backgroundColor: c.background.secondary, borderRadius: 8,
      borderWidth: 1, borderColor: c.border.default, textAlign: 'center',
    },
    tierLabel: { fontSize: 12, fontWeight: '600', color: c.text.muted },
    tierDeleteBtn: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: '#ef44441A', alignItems: 'center', justifyContent: 'center',
    },
    addTierBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 12,
    },
    addTierText: { fontSize: 13, fontWeight: '700', color: c.accent.primary },
    // Tie-breaker reorder
    tbItem: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    tbRank: {
      width: 24, height: 24, borderRadius: 7,
      backgroundColor: c.accent.primary + '1A', borderWidth: 1,
      borderColor: c.accent.primary + '40', alignItems: 'center', justifyContent: 'center',
    },
    tbRankText:  { fontSize: 11, fontWeight: '800', color: c.accent.primary },
    tbLabel:     { flex: 1, fontSize: 14, fontWeight: '600', color: c.text.primary },
    tbArrows:    { flexDirection: 'row', gap: 4 },
    tbArrowBtn: {
      width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.surface.raised, borderWidth: 1, borderColor: c.border.default,
    },
    // Stepper
    stepperRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    stepperLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text.primary },
    stepperBtn: {
      width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.accent.primary + '15', borderWidth: 1, borderColor: c.accent.primary + '40',
    },
    stepperVal: { fontSize: 16, fontWeight: '800', color: c.text.primary, minWidth: 24, textAlign: 'center' },
    // Footer nav
    footer: {
      flexDirection: 'row', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border.default,
      backgroundColor: c.background.secondary,
    },
    backFooterBtn: {
      flex: 1, paddingVertical: 14, borderRadius: 14,
      backgroundColor: c.surface.card, borderWidth: 1, borderColor: c.border.default,
      alignItems: 'center',
    },
    backFooterText: { fontSize: 15, fontWeight: '700', color: c.text.muted },
    nextBtn: {
      flex: 2, paddingVertical: 14, borderRadius: 14,
      backgroundColor: c.accent.primary, alignItems: 'center',
      shadowColor: c.accent.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32, shadowRadius: 10, elevation: 8,
    },
    nextText: { fontSize: 15, fontWeight: '800', color: c.text.inverse },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
    warningBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      backgroundColor: '#f59e0b1A', borderRadius: 10, borderWidth: 1,
      borderColor: '#f59e0b40', paddingHorizontal: 14, paddingVertical: 10,
      marginHorizontal: 16, marginBottom: 12,
    },
    warningText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#92400e' },
    // ── Date field ────────────────────────────────────────────────────────────
    datePickerBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, paddingHorizontal: 12,
      backgroundColor: c.background.secondary, borderRadius: 10,
      borderWidth: 1, borderColor: c.border.default,
    },
    datePickerText: { flex: 1, fontSize: 15, fontWeight: '500' },
    pickerOverlay: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' },
    pickerSheet: {
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
      paddingBottom: 16,
      backgroundColor: c.surface.card,
    },
    pickerSheetHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default,
    },
    pickerSheetTitle: { fontSize: 14, fontWeight: '600', color: c.text.muted },
    pickerSheetDone: { fontSize: 16, fontWeight: '700', color: c.accent.primary },
    // ── Location picker ───────────────────────────────────────────────────────
    locationPickerBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, paddingHorizontal: 12,
      backgroundColor: c.background.secondary, borderRadius: 10,
      borderWidth: 1, borderColor: c.border.default,
    },
    locationPickerText: { flex: 1, fontSize: 15, fontWeight: '500' },
    locationModal: {
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
      overflow: 'hidden', backgroundColor: c.surface.card,
    },
    locationModalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default,
    },
    locationModalTitle: { fontSize: 17, fontWeight: '700', color: c.text.primary },
    locationOption: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border.default + '80',
    },
    locationOptionText: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text.primary },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function epochToDateStr(epochMs: number): string {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatDateDisplay(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Predefined locations ─────────────────────────────────────────────────────

const LOCATIONS = [
  'Ankara Tenis Kulübü (ATK)',
  'ODTÜ Tenis Kortları',
  'Eryaman Tenis Kortları',
  'Bilkent Sports International',
  'Cepa/Kentpark Kortları',
  'Diğer',
] as const;

const TIE_BREAKER_LABELS: Record<TieBreakerCriterion, string> = {
  head_to_head:    'Birbirine Karşı Maç',
  set_difference:  'Set Farkı',
  game_difference: 'Oyun Farkı',
  power_points:    'Güç Puanı',
};

const ALL_TIE_BREAKERS: TieBreakerCriterion[] = [
  'head_to_head', 'set_difference', 'game_difference', 'power_points',
];

// ─── Date field ───────────────────────────────────────────────────────────────

function DateField({
  label,
  date,
  onDateChange,
  minimumDate,
  S,
}: {
  label:         string;
  date:          Date | null;
  onDateChange:  (d: Date) => void;
  minimumDate?:  Date;
  S:             ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [showPicker, setShowPicker] = useState(false);

  const handlePress = () => {
    if (Platform.OS === 'android') {
      // On Android the DateTimePicker renders as a native dialog — show inline
      setShowPicker(true);
    } else {
      setShowPicker(true);
    }
  };

  const handleChange = (_: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate) onDateChange(selectedDate);
  };

  const hasDate  = date !== null;
  const display  = hasDate ? formatDateDisplay(date) : 'Tarih Seçin';
  const textColor = hasDate ? c.text.primary : c.text.muted;
  const iconColor = hasDate ? c.accent.primary : c.text.muted;

  return (
    <>
      <TouchableOpacity style={S.datePickerBtn} onPress={handlePress} activeOpacity={0.75}>
        <Ionicons name="calendar-outline" size={16} color={iconColor} />
        <Text style={[S.datePickerText, { color: textColor }]}>{display}</Text>
        <Ionicons name="chevron-forward" size={14} color={c.text.muted} />
      </TouchableOpacity>

      {/* Android: render inline (dialog opens automatically) */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={date ?? new Date()}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleChange}
        />
      )}

      {/* iOS: bottom sheet modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={S.pickerOverlay} onPress={() => setShowPicker(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={S.pickerSheet}>
                <View style={S.pickerSheetHeader}>
                  <Text style={S.pickerSheetTitle}>{label}</Text>
                  <TouchableOpacity onPress={() => setShowPicker(false)}>
                    <Text style={S.pickerSheetDone}>Tamam</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={date ?? new Date()}
                  mode="date"
                  display="spinner"
                  minimumDate={minimumDate}
                  onChange={handleChange}
                  locale="tr-TR"
                  style={{ height: 200 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

// ─── Location picker field ────────────────────────────────────────────────────

function LocationField({
  value,
  onSelect,
  S,
}: {
  value:    string;
  onSelect: (location: string) => void;
  S:        ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);

  const handleSelect = (loc: string) => {
    onSelect(loc);
    setShowModal(false);
  };

  const hasValue  = value.length > 0;
  const textColor = hasValue ? c.text.primary : c.text.muted;
  const iconColor = hasValue ? c.accent.primary : c.text.muted;

  return (
    <>
      <TouchableOpacity style={S.locationPickerBtn} onPress={() => setShowModal(true)} activeOpacity={0.75}>
        <Ionicons name="location-outline" size={16} color={iconColor} />
        <Text style={[S.locationPickerText, { color: textColor }]} numberOfLines={1}>
          {hasValue ? value : 'Konum Seçin'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={c.text.muted} />
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' }} onPress={() => setShowModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={[S.locationModal, { paddingBottom: insets.bottom + 8 }]}>
              <View style={S.locationModalHeader}>
                <Text style={S.locationModalTitle}>Konum Seçin</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={22} color={c.text.muted} />
                </TouchableOpacity>
              </View>
              {LOCATIONS.map((loc, idx) => (
                <TouchableOpacity
                  key={loc}
                  style={[
                    S.locationOption,
                    value === loc && { backgroundColor: c.accent.primary + '0F' },
                    idx === LOCATIONS.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => handleSelect(loc)}
                  activeOpacity={0.72}
                >
                  <Text style={[S.locationOptionText, value === loc && { color: c.accent.primary, fontWeight: '700' }]}>
                    {loc}
                  </Text>
                  {value === loc && <Ionicons name="checkmark" size={18} color={c.accent.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Reusable sub-widgets ─────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  const { theme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors), [theme]);
  return (
    <View style={S.sectionHeader}>
      <Ionicons name={icon as never} size={14} color="#6b7280" />
      <Text style={S.sectionTitle}>{title}</Text>
    </View>
  );
}

function Stepper({
  label, value, min, max, onChange,
}: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
}) {
  const { theme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors), [theme]);
  const c = theme.colors;
  return (
    <View style={S.stepperRow}>
      <Text style={S.stepperLabel}>{label}</Text>
      <TouchableOpacity style={S.stepperBtn} onPress={() => onChange(Math.max(min, value - 1))}>
        <Ionicons name="remove" size={18} color={c.accent.primary} />
      </TouchableOpacity>
      <Text style={S.stepperVal}>{value}</Text>
      <TouchableOpacity style={S.stepperBtn} onPress={() => onChange(Math.min(max, value + 1))}>
        <Ionicons name="add" size={18} color={c.accent.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Step content components ──────────────────────────────────────────────────

function Step1({
  state, setState, S,
}: {
  state: Step1State;
  setState: React.Dispatch<React.SetStateAction<Step1State>>;
  S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isPaid = state.paymentMethod !== 'free';

  return (
    <ScrollView contentContainerStyle={[S.scroll, { paddingBottom: 160 }]} showsVerticalScrollIndicator={false}>

      {/* Title */}
      <View style={S.sectionCard}>
        <SectionHeader icon="text-outline" title="Temel Bilgiler" />
        <View style={S.fieldRow}>
          <Text style={S.fieldLabel}>Turnuva Adı *</Text>
          <TextInput
            style={S.input}
            placeholder="Örn: Bosphorus Open 2026"
            placeholderTextColor={c.text.muted}
            value={state.title}
            onChangeText={(t) => setState((s) => ({ ...s, title: t }))}
            returnKeyType="next"
          />
        </View>
        <View style={[S.fieldRow, { borderBottomWidth: 0 }]}>
          <Text style={S.fieldLabel}>Konum *</Text>
          <LocationField
            value={state.location}
            onSelect={(loc) => setState((s) => ({ ...s, location: loc }))}
            S={S}
          />
        </View>
      </View>

      {/* Type */}
      <View style={S.sectionCard}>
        <SectionHeader icon="trophy-outline" title="Tür" />
        <View style={S.pillRow}>
          {(['Lig', 'Defi', 'Özel'] as TournamentTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[S.pill, state.type === t && S.pillActive]}
              onPress={() => setState((s) => ({ ...s, type: t }))}
              activeOpacity={0.75}
            >
              <Text style={[S.pillText, state.type === t && S.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Format */}
      <View style={S.sectionCard}>
        <SectionHeader icon="git-branch-outline" title="Format" />
        <View style={S.pillRow}>
          {(['Lig', 'Eleme', 'Lig+Eleme'] as TournamentFormat[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[S.pill, state.format === f && S.pillActive]}
              onPress={() => setState((s) => ({ ...s, format: f }))}
              activeOpacity={0.75}
            >
              <Text style={[S.pillText, state.format === f && S.pillTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Dates */}
      <View style={S.sectionCard}>
        <SectionHeader icon="calendar-outline" title="Tarihler" />
        <View style={S.fieldRow}>
          <Text style={S.fieldLabel}>Başlangıç Tarihi *</Text>
          <DateField
            label="Başlangıç Tarihi"
            date={state.startDate}
            onDateChange={(d) => setState((s) => ({ ...s, startDate: d }))}
            S={S}
          />
        </View>
        <View style={[S.fieldRow, { borderBottomWidth: 0 }]}>
          <Text style={S.fieldLabel}>Bitiş Tarihi *</Text>
          <DateField
            label="Bitiş Tarihi"
            date={state.endDate}
            minimumDate={state.startDate ?? undefined}
            onDateChange={(d) => setState((s) => ({ ...s, endDate: d }))}
            S={S}
          />
        </View>
      </View>

      {/* Visibility */}
      <View style={S.sectionCard}>
        <SectionHeader icon="eye-outline" title="Görünürlük" />
        <View style={S.pillRow}>
          {([['public', 'Herkese Açık'], ['private', 'Özel 🔒']] as const).map(([v, label]) => (
            <TouchableOpacity
              key={v}
              style={[S.pill, state.visibility === v && S.pillActive]}
              onPress={() => setState((s) => ({ ...s, visibility: v }))}
              activeOpacity={0.75}
            >
              <Text style={[S.pillText, state.visibility === v && S.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {state.visibility === 'private' && (
          <View style={S.fieldRow}>
            <Text style={S.fieldLabel}>Davet Kodu</Text>
            <TextInput
              style={S.input}
              placeholder="Örn: BOGAZICI26"
              placeholderTextColor={c.text.muted}
              value={state.inviteCode}
              onChangeText={(t) => setState((s) => ({ ...s, inviteCode: t.toUpperCase() }))}
              autoCapitalize="characters"
            />
          </View>
        )}
      </View>

      {/* Payment */}
      <View style={S.sectionCard}>
        <SectionHeader icon="card-outline" title="Katılım Ücreti" />
        <View style={S.pillRow}>
          {([['free', 'Ücretsiz'], ['manual', 'Manuel'], ['in_app', 'Uygulama İçi']] as const).map(([m, label]) => (
            <TouchableOpacity
              key={m}
              style={[S.pill, state.paymentMethod === m && S.pillActive]}
              onPress={() => setState((s) => ({ ...s, paymentMethod: m }))}
              activeOpacity={0.75}
            >
              <Text style={[S.pillText, state.paymentMethod === m && S.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {isPaid && (
          <View style={[S.fieldRow, { borderBottomWidth: 0 }]}>
            <Text style={S.fieldLabel}>Ücret (₺) *</Text>
            <TextInput
              style={S.input}
              placeholder="150"
              placeholderTextColor={c.text.muted}
              value={state.entryFee}
              onChangeText={(t) => setState((s) => ({ ...s, entryFee: t.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
            />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Step2({
  state, setState, S,
}: {
  state: Step2State;
  setState: React.Dispatch<React.SetStateAction<Step2State>>;
  S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  const isCustom = state.scoringSystem === 'custom';

  const addTier = () => {
    if (state.tierAssignments.length >= state.maxPointTypes) {
      Alert.alert('Limit', `En fazla ${state.maxPointTypes} kademe ekleyebilirsiniz.`);
      return;
    }
    setState((s) => ({
      ...s,
      tierAssignments: [
        ...s.tierAssignments,
        { rankStart: (s.tierAssignments.at(-1)?.rankEnd ?? 0) + 1, rankEnd: (s.tierAssignments.at(-1)?.rankEnd ?? 0) + 5, pointsAssigned: 10 },
      ],
    }));
  };

  const removeTier = (idx: number) => {
    setState((s) => ({
      ...s,
      tierAssignments: s.tierAssignments.filter((_, i) => i !== idx),
    }));
  };

  const updateTier = (idx: number, field: keyof TierAssignment, raw: string) => {
    const val = parseInt(raw, 10);
    if (isNaN(val) && raw !== '') return;
    setState((s) => ({
      ...s,
      tierAssignments: s.tierAssignments.map((t, i) =>
        i === idx ? { ...t, [field]: isNaN(val) ? 0 : val } : t,
      ),
    }));
  };

  return (
    <ScrollView contentContainerStyle={[S.scroll, { paddingBottom: 160 }]} showsVerticalScrollIndicator={false}>

      {/* Scoring system */}
      <View style={S.sectionCard}>
        <SectionHeader icon="flash-outline" title="Puanlama Sistemi" />
        <View style={S.pillRow}>
          {([['classic', 'Klasik'], ['custom', 'Özel Güç Puanı']] as const).map(([v, label]) => (
            <TouchableOpacity
              key={v}
              style={[S.pill, state.scoringSystem === v && S.pillActive]}
              onPress={() => setState((s) => ({ ...s, scoringSystem: v }))}
              activeOpacity={0.75}
            >
              <Text style={[S.pillText, state.scoringSystem === v && S.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Custom config */}
      {isCustom && (
        <>
          <View style={S.sectionCard}>
            <SectionHeader icon="options-outline" title="Güç Puanı Yapılandırması" />
            <Stepper
              label="Maksimum kademe sayısı"
              value={state.maxPointTypes}
              min={1} max={10}
              onChange={(v) => setState((s) => ({ ...s, maxPointTypes: v }))}
            />
          </View>

          <View style={S.sectionCard}>
            <SectionHeader icon="list-outline" title="Sıralama Kademeleri" />
            {state.tierAssignments.map((tier, idx) => (
              <View key={idx} style={S.tierRow}>
                <Text style={S.tierLabel}>#</Text>
                <TextInput
                  style={S.tierInput}
                  keyboardType="number-pad"
                  value={String(tier.rankStart)}
                  onChangeText={(v) => updateTier(idx, 'rankStart', v)}
                />
                <Text style={S.tierLabel}>—</Text>
                <TextInput
                  style={S.tierInput}
                  keyboardType="number-pad"
                  value={String(tier.rankEnd)}
                  onChangeText={(v) => updateTier(idx, 'rankEnd', v)}
                />
                <Text style={S.tierLabel}>:</Text>
                <TextInput
                  style={S.tierInput}
                  keyboardType="number-pad"
                  value={String(tier.pointsAssigned)}
                  onChangeText={(v) => updateTier(idx, 'pointsAssigned', v)}
                />
                <Text style={S.tierLabel}>PP</Text>
                <TouchableOpacity style={S.tierDeleteBtn} onPress={() => removeTier(idx)}>
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={S.addTierBtn} onPress={addTier} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={16} color={c.accent.primary} />
              <Text style={S.addTierText}>Kademe Ekle</Text>
            </TouchableOpacity>
          </View>

          <View style={S.sectionCard}>
            <SectionHeader icon="timer-outline" title="Güncelleme Sıklığı" />
            <View style={S.pillRow}>
              {([['dynamic', 'Anlık'], ['periodic', 'Periyodik'], ['manual', 'Manuel']] as const).map(([v, label]) => (
                <TouchableOpacity
                  key={v}
                  style={[S.pill, state.updateFrequency === v && S.pillActive]}
                  onPress={() => setState((s) => ({ ...s, updateFrequency: v }))}
                  activeOpacity={0.75}
                >
                  <Text style={[S.pillText, state.updateFrequency === v && S.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Step3({
  state, setState, S,
}: {
  state: Step3State;
  setState: React.Dispatch<React.SetStateAction<Step3State>>;
  S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setState((s) => {
      const arr = [...s.tieBreakerPriority];
      [arr[idx - 1], arr[idx]] = [arr[idx]!, arr[idx - 1]!];
      return { ...s, tieBreakerPriority: arr };
    });
  };

  const moveDown = (idx: number) => {
    setState((s) => {
      if (idx >= s.tieBreakerPriority.length - 1) return s;
      const arr = [...s.tieBreakerPriority];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1]!, arr[idx]!];
      return { ...s, tieBreakerPriority: arr };
    });
  };

  const toggleTB = (criterion: TieBreakerCriterion) => {
    setState((s) => {
      const exists = s.tieBreakerPriority.includes(criterion);
      return {
        ...s,
        tieBreakerPriority: exists
          ? s.tieBreakerPriority.filter((c) => c !== criterion)
          : [...s.tieBreakerPriority, criterion],
      };
    });
  };

  const vr = state.visibilityRules;
  const setVR = (key: keyof typeof vr, val: boolean) =>
    setState((s) => ({ ...s, visibilityRules: { ...s.visibilityRules, [key]: val } }));

  const conflictWarning = state.winByTwo && state.lastSetTieBreak;

  return (
    <ScrollView contentContainerStyle={[S.scroll, { paddingBottom: 160 }]} showsVerticalScrollIndicator={false}>

      {/* Match rules */}
      <View style={S.sectionCard}>
        <SectionHeader icon="tennisball-outline" title="Maç Kuralları" />
        <Stepper
          label="Kazanmak için set"
          value={state.setsToWin}
          min={1} max={5}
          onChange={(v) => setState((s) => ({ ...s, setsToWin: v }))}
        />
        <View style={S.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.switchLabel}>2 Fark Kuralı</Text>
            <Text style={S.switchSub}>Kazanan 2 oyun önde olmalı</Text>
          </View>
          <Switch
            value={state.winByTwo}
            onValueChange={(v) => setState((s) => ({ ...s, winByTwo: v }))}
            trackColor={{ true: c.accent.primary }}
          />
        </View>
        <View style={[S.switchRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={S.switchLabel}>Son Set Tie-Break</Text>
            <Text style={S.switchSub}>Belirleyici set tie-break'te bitirilir</Text>
          </View>
          <Switch
            value={state.lastSetTieBreak}
            onValueChange={(v) => setState((s) => ({ ...s, lastSetTieBreak: v }))}
            trackColor={{ true: c.accent.primary }}
          />
        </View>
      </View>

      {conflictWarning && (
        <View style={S.warningBox}>
          <Ionicons name="warning-outline" size={16} color="#d97706" />
          <Text style={S.warningText}>
            "2 Fark" ve "Son Set Tie-Break" aynı anda aktif olamaz. Belirleyici sette biri devre dışı bırakılmalıdır.
          </Text>
        </View>
      )}

      {/* Tie-breaker priority (reorderable) */}
      <View style={S.sectionCard}>
        <SectionHeader icon="swap-vertical-outline" title="Eşitlik Bozma Sırası" />
        {state.tieBreakerPriority.map((criterion, idx) => (
          <View
            key={criterion}
            style={[S.tbItem, idx === state.tieBreakerPriority.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={S.tbRank}>
              <Text style={S.tbRankText}>{idx + 1}</Text>
            </View>
            <Text style={S.tbLabel}>{TIE_BREAKER_LABELS[criterion]}</Text>
            <View style={S.tbArrows}>
              <TouchableOpacity
                style={[S.tbArrowBtn, idx === 0 && { opacity: 0.3 }]}
                onPress={() => moveUp(idx)}
                disabled={idx === 0}
              >
                <Ionicons name="chevron-up" size={14} color={c.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.tbArrowBtn, idx === state.tieBreakerPriority.length - 1 && { opacity: 0.3 }]}
                onPress={() => moveDown(idx)}
                disabled={idx === state.tieBreakerPriority.length - 1}
              >
                <Ionicons name="chevron-down" size={14} color={c.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {/* Toggle un-used criteria */}
        <View style={S.sectionHeader}>
          <Text style={[S.sectionTitle, { paddingTop: 0 }]}>Ek Kriter Ekle / Çıkar</Text>
        </View>
        {ALL_TIE_BREAKERS.filter((c) => !state.tieBreakerPriority.includes(c)).map((criterion) => (
          <TouchableOpacity key={criterion} style={S.tbItem} onPress={() => toggleTB(criterion)}>
            <Ionicons name="add-circle-outline" size={18} color={c.accent.primary} />
            <Text style={[S.tbLabel, { color: c.text.muted }]}>{TIE_BREAKER_LABELS[criterion]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Visibility rules */}
      <View style={S.sectionCard}>
        <SectionHeader icon="eye-outline" title="İstatistik Görünürlüğü" />
        {([
          ['showMatchesPlayed', 'Oynanan Maç Sayısı'],
          ['showWins',         'Galibiyet'],
          ['showGamesWon',     'Oyun Farkı'],
          ['showPowerPoints',  'Güç Puanı'],
        ] as const).map(([key, label], idx, arr) => (
          <View key={key} style={[S.switchRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={S.switchLabel}>{label}</Text>
            <Switch
              value={vr[key]}
              onValueChange={(v) => setVR(key, v)}
              trackColor={{ true: c.accent.primary }}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  current, total, S,
}: {
  current: number; total: number; S: ReturnType<typeof makeStyles>;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={S.stepIndicator}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const isDone   = n < current;
        const isActive = n === current;
        const style = isDone ? S.stepDotDone : isActive ? S.stepDotActive : S.stepDotIdle;
        const textColor = isActive ? c.text.inverse : isDone ? c.accent.primary : c.text.muted;
        return (
          <Fragment key={i}>
            {i > 0 && (
              <View
                style={[S.stepLine, { backgroundColor: i < current - 1 ? c.accent.primary : c.border.default }]}
              />
            )}
            <View style={[S.stepDot, style]}>
              {isDone
                ? <Ionicons name="checkmark" size={13} color={c.accent.primary} />
                : <Text style={[S.stepDotText, { color: textColor }]}>{n}</Text>
              }
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CreateEditTournamentScreen() {
  const insets     = useSafeAreaInsets();
  const route      = useRoute<CETRoute>();
  const navigation = useNavigation<CETNav>();
  const { uid }    = useAuth();
  const { theme }  = useTheme();
  const c          = theme.colors;
  const S          = useMemo(() => makeStyles(c), [theme]);

  const { tournamentId } = route.params ?? {};
  const isEditMode = Boolean(tournamentId);

  // ── Form state ──────────────────────────────────────────────────────────
  const [step,        setStep]        = useState(1);
  const [s1,          setS1]          = useState<Step1State>(DEFAULT_S1);
  const [s2,          setS2]          = useState<Step2State>(DEFAULT_S2);
  const [s3,          setS3]          = useState<Step3State>(DEFAULT_S3);
  const [isLoading,   setIsLoading]   = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Populate from existing tournament in edit mode ──────────────────────
  useEffect(() => {
    if (!tournamentId) return;
    fetchTournamentById(tournamentId)
      .then((t) => {
        if (!t) { Alert.alert('Hata', 'Turnuva bulunamadı.'); navigation.goBack(); return; }
        setS1({
          title:         t.title,
          type:          t.type,
          format:        t.format,
          location:      t.location,
          startDate:     t.startDate ? new Date(t.startDate) : null,
          endDate:       t.endDate   ? new Date(t.endDate)   : null,
          visibility:    t.visibility,
          inviteCode:    t.inviteCode ?? '',
          paymentMethod: t.paymentMethod,
          entryFee:      t.paymentMethod !== 'free' ? String(t.entryFee) : '',
        });
        setS2({
          scoringSystem:   t.scoringSystem,
          maxPointTypes:   t.scoringSystem === 'custom' ? t.powerPointConfig.maxPointTypes  : 3,
          tierAssignments: t.scoringSystem === 'custom' ? t.powerPointConfig.tierAssignments : DEFAULT_S2.tierAssignments,
          updateFrequency: t.scoringSystem === 'custom' ? t.powerPointConfig.updateFrequency : 'dynamic',
        });
        setS3({
          setsToWin:          t.matchRules.setsToWin,
          winByTwo:           t.matchRules.winByTwo,
          lastSetTieBreak:    t.matchRules.lastSetTieBreak,
          tieBreakerPriority: t.tieBreakerPriority,
          visibilityRules:    t.visibilityRules,
        });
      })
      .catch((err: unknown) => {
        Alert.alert('Hata', err instanceof Error ? err.message : 'Turnuva yüklenemedi.');
        navigation.goBack();
      })
      .finally(() => setIsLoading(false));
  }, [tournamentId]);

  // ── Step validation ──────────────────────────────────────────────────────
  const validateStep1 = useCallback((): string | null => {
    if (!s1.title.trim()) return 'Lütfen turnuva adını girin.';
    if (!s1.location.trim()) return 'Lütfen bir konum seçin.';
    if (!s1.startDate) return 'Lütfen başlangıç tarihini seçin.';
    if (!s1.endDate)   return 'Lütfen bitiş tarihini seçin.';
    if (s1.endDate.getTime() < s1.startDate.getTime()) return 'Bitiş tarihi başlangıçtan önce olamaz.';
    if (s1.paymentMethod !== 'free') {
      const fee = parseInt(s1.entryFee, 10);
      if (isNaN(fee) || fee <= 0) return 'Geçerli bir katılım ücreti girin.';
    }
    return null;
  }, [s1]);

  const validateStep2 = useCallback((): string | null => {
    if (s2.scoringSystem === 'custom') {
      if (s2.tierAssignments.length === 0) return 'En az bir puan kademesi ekleyin.';
      if (s2.tierAssignments.length > s2.maxPointTypes) {
        return `Kademe sayısı ${s2.maxPointTypes} limitini aşıyor.`;
      }
      for (const t of s2.tierAssignments) {
        if (t.rankStart > t.rankEnd) return 'Kademe başlangıç sırası bitiş sırasından büyük olamaz.';
        if (t.pointsAssigned < 0) return 'Puan değeri 0\'dan küçük olamaz.';
      }
    }
    return null;
  }, [s2]);

  const validateStep3 = useCallback((): string | null => {
    if (s3.tieBreakerPriority.length === 0) return 'En az bir eşitlik bozma kriteri seçin.';
    return null;
  }, [s3]);

  // ── Navigate steps ───────────────────────────────────────────────────────
  const handleNext = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});

    if (step === 1) {
      const err = validateStep1();
      if (err) { Alert.alert('Eksik Bilgi', err); return; }
      setStep(2); return;
    }

    if (step === 2) {
      const err = validateStep2();
      if (err) { Alert.alert('Hata', err); return; }
      setStep(3); return;
    }

    // Step 3 — submit
    const err = validateStep3();
    if (err) { Alert.alert('Hata', err); return; }

    if (!uid) { Alert.alert('Hata', 'Oturum açmanız gerekiyor.'); return; }

    try {
      setIsSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const startDate = s1.startDate!.getTime();
      const endDate   = s1.endDate!.getTime();

      const basePayload = {
        title:       s1.title.trim(),
        type:        s1.type,
        format:      s1.format,
        status:      'upcoming' as const,
        organizerId: uid,
        startDate,
        endDate,
        location:    s1.location.trim(),
        visibility:  s1.visibility,
        ...(s1.visibility === 'private' && s1.inviteCode
          ? { inviteCode: s1.inviteCode.trim() }
          : {}),
        matchRules: {
          setsToWin:       s3.setsToWin,
          lastSetTieBreak: s3.lastSetTieBreak,
          winByTwo:        s3.winByTwo,
        },
        tieBreakerPriority: s3.tieBreakerPriority,
        visibilityRules:    s3.visibilityRules,
        hasLegacyData:      false,
        ...(s2.scoringSystem === 'custom'
          ? {
              scoringSystem: 'custom' as const,
              powerPointConfig: {
                maxPointTypes:   s2.maxPointTypes,
                tierAssignments: s2.tierAssignments,
                updateFrequency: s2.updateFrequency,
              },
            }
          : { scoringSystem: 'classic' as const }),
        ...(s1.paymentMethod === 'free'
          ? { paymentMethod: 'free' as const }
          : { paymentMethod: s1.paymentMethod, entryFee: parseInt(s1.entryFee, 10) }),
      } satisfies Omit<Tournament, 'id' | 'createdAt'>;

      if (isEditMode && tournamentId) {
        await updateTournament(tournamentId, basePayload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Güncellendi', 'Turnuva bilgileri güncellendi.', [
          { text: 'Tamam', onPress: () => navigation.goBack() },
        ]);
      } else {
        await createTournament(basePayload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert('Oluşturuldu!', 'Turnuvanız başarıyla oluşturuldu.', [
          { text: 'Tamam', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'İşlem başarısız.');
    } finally {
      setIsSubmitting(false);
    }
  }, [step, s1, s2, s3, uid, isEditMode, tournamentId, navigation]);

  const handleBack = useCallback(() => {
    if (step > 1) { setStep((s) => s - 1); return; }
    navigation.goBack();
  }, [step, navigation]);

  // ── Loading (edit mode fetch) ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[S.root, S.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={c.accent.primary} />
      </View>
    );
  }

  const stepTitles = ['Temel Bilgiler', 'Puanlama', 'Kurallar & Görünürlük'];
  const nextLabel  = step < 3 ? 'İleri →' : isSubmitting ? '…' : isEditMode ? 'Kaydet' : 'Oluştur';

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={S.header}>
        <TouchableOpacity style={S.headerBack} onPress={handleBack}>
          <Ionicons name="chevron-back" size={26} color={c.text.primary} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>
          {isEditMode ? 'Turnuvayı Düzenle' : 'Yeni Turnuva'} — {stepTitles[step - 1]}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Step indicator ────────────────────────────────────────────── */}
      <StepIndicator current={step} total={3} S={S} />

      {/* ── Step content ──────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {step === 1 && <Step1 state={s1} setState={setS1} S={S} />}
        {step === 2 && <Step2 state={s2} setState={setS2} S={S} />}
        {step === 3 && <Step3 state={s3} setState={setS3} S={S} />}
      </KeyboardAvoidingView>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <View style={[S.footer, { paddingBottom: insets.bottom + 72 }]}>
        {step > 1 && (
          <TouchableOpacity style={S.backFooterBtn} onPress={handleBack} activeOpacity={0.8}>
            <Text style={S.backFooterText}>← Geri</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[S.nextBtn, isSubmitting && { opacity: 0.6 }]}
          onPress={handleNext}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? <ActivityIndicator color={c.text.inverse} size="small" />
            : <Text style={S.nextText}>{nextLabel}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}
