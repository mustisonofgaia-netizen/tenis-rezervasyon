/**
 * ExploreScreen — Editorial club discovery feed.
 *
 * Sections (top → bottom):
 *  1. Editorial header  — personalised greeting + hero title
 *  2. Horizontal pills  — single-select filter row
 *  3. Hero image card   — full-bleed photo, gradient, rating badge, CTA
 *  4. Club feed         — themed ClubCard list
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useMemo, useState } from 'react';
import {
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLUBS, getCourtsByClubId } from '../config/data';
import type { Club, ClubCourt } from '../config/data';
import type { ExploreStackParamList } from '../navigation/types';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { fontSizes, fontWeights } from '../theme';
import type { ColorTokens } from '../theme/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExploreNavProp = NativeStackNavigationProp<ExploreStackParamList, 'ExploreHome'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const H_PAD = 24;

const FILTERS = ['Tümü', 'Kortlar', 'Etkinlikler', 'Yakınımda'] as const;

// Premium outdoor tennis court — Unsplash, free-to-use
const HERO_IMAGE_URI =
  'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&q=80';

const slide = (delay: number) =>
  FadeInDown.delay(delay).duration(480).easing(Easing.out(Easing.cubic));

// ─── Theme-aware style factory ────────────────────────────────────────────────
// Structural styles only — all colour values are injected inline from the theme.
// The factory accepts (c, isDark) to maintain architectural consistency.

function makeStyles(_c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({

    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingTop:    28,
      paddingBottom: 120,
    },

    headerSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      24,
    },
    greeting: {
      fontSize:     fontSizes.sm,
      fontWeight:   fontWeights.medium,
      marginBottom: 6,
      letterSpacing: 0.1,
    },
    headerTitle: {
      fontSize:      fontSizes['4xl'],
      fontWeight:    fontWeights.extrabold,
      letterSpacing: -1.2,
      lineHeight:    42,
    },

    filterWrapper: {
      marginBottom: 24,
    },
    filtersContent: {
      paddingHorizontal: H_PAD,
      paddingVertical:   4,
      gap:               8,
    },
    filterPill: {
      paddingHorizontal: 18,
      paddingVertical:   9,
      borderRadius:      99,
      borderWidth:       1,
    },
    filterPillText: {
      fontSize:      fontSizes.sm,
      fontWeight:    fontWeights.semibold,
      letterSpacing: 0.1,
    },

    heroSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      28,
    },
    heroCard: {
      height:         268,
      borderRadius:   24,
      overflow:       'hidden',
      justifyContent: 'flex-end',
    },
    heroOverlay: {
      backgroundColor: 'rgba(15,23,42,0.60)',
    },
    ratingBadge: {
      position:          'absolute',
      top:               14,
      right:             14,
      backgroundColor:   'rgba(0,0,0,0.60)',
      paddingHorizontal: 12,
      paddingVertical:   6,
      borderRadius:      20,
    },
    ratingText: {
      fontSize:      fontSizes.xs,
      fontWeight:    fontWeights.bold,
      color:         '#FFFFFF',
      letterSpacing: 0.2,
    },
    heroContent: {
      padding: H_PAD,
      gap:     6,
    },
    heroTitle: {
      fontSize:      fontSizes['2xl'],
      fontWeight:    fontWeights.extrabold,
      color:         '#FFFFFF',
      letterSpacing: -0.5,
    },
    heroSubtitle: {
      fontSize:     fontSizes.sm,
      fontWeight:   fontWeights.regular,
      color:        'rgba(255,255,255,0.72)',
      marginBottom: 8,
    },
    heroCta: {
      flexDirection:     'row',
      alignItems:        'center',
      alignSelf:         'flex-start',
      paddingHorizontal: 18,
      paddingVertical:   10,
      borderRadius:      14,
    },
    heroCtaText: {
      fontSize:      fontSizes.sm,
      fontWeight:    fontWeights.bold,
      color:         '#FFFFFF',
      letterSpacing: 0.1,
    },

    sectionLabelSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      16,
    },
    sectionLabel: {
      fontSize:      fontSizes.xl,
      fontWeight:    fontWeights.extrabold,
      letterSpacing: -0.4,
    },

    cardSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      16,
    },
    card: {
      borderRadius:  22,
      overflow:      'hidden',
      shadowColor:   '#000000',
      shadowOffset:  { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius:  20,
      elevation:     5,
      borderWidth:   StyleSheet.hairlineWidth,
    },

    imageWrapper: {
      height:   200,
      position: 'relative',
    },
    clubImage: {
      width:  '100%',
      height: '100%',
    },
    imageOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    courtCountBadge: {
      position:          'absolute',
      top:               12,
      right:             12,
      flexDirection:     'row',
      alignItems:        'center',
      gap:               4,
      backgroundColor:   'rgba(0,0,0,0.50)',
      paddingHorizontal: 10,
      paddingVertical:   5,
      borderRadius:      20,
    },
    courtCountText: {
      fontSize:      fontSizes.xs,
      fontWeight:    fontWeights.bold,
      color:         '#FFFFFF',
      letterSpacing: 0.2,
    },

    infoArea: {
      padding: 18,
      gap:     8,
    },
    nameRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            8,
    },
    clubName: {
      flex:          1,
      fontSize:      fontSizes.lg,
      fontWeight:    fontWeights.extrabold,
      letterSpacing: -0.4,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           4,
    },
    addressText: {
      fontSize:   fontSizes.sm,
      fontWeight: fontWeights.medium,
      flex:       1,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:           6,
      marginTop:     4,
    },
    chip: {
      borderRadius:      20,
      paddingHorizontal: 10,
      paddingVertical:   5,
    },
    chipText: {
      fontSize:      fontSizes.xs,
      fontWeight:    fontWeights.semibold,
      letterSpacing: 0.1,
    },
  });
}

// ─── Hero card ────────────────────────────────────────────────────────────────

type HeroCardProps = {
  accentColor: string;
  onPress:     () => void;
};

function HeroCard({ accentColor, onPress }: HeroCardProps) {
  const { theme, colorScheme } = useTheme();
  const S = useMemo(() => makeStyles(theme.colors, colorScheme === 'dark'), [theme, colorScheme]);

  return (
    <TouchableOpacity style={S.heroCard} activeOpacity={0.92} onPress={onPress}>

      {/* Full-bleed background image */}
      <ImageBackground
        source={{ uri: HERO_IMAGE_URI }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Dark overlay — keeps white text legible without native gradient module */}
      <View style={[StyleSheet.absoluteFillObject, S.heroOverlay]} />

      {/* Rating badge — floating top-right pill */}
      <View style={S.ratingBadge}>
        <Text style={S.ratingText}>⭐  4.8</Text>
      </View>

      {/* Bottom overlay: title · subtitle · CTA */}
      <View style={S.heroContent}>
        <Text style={S.heroTitle}>Popüler Kortlar</Text>
        <Text style={S.heroSubtitle}>İstanbul'un en iyi kort seçenekleri</Text>
        <TouchableOpacity
          style={[S.heroCta, { backgroundColor: accentColor }]}
          activeOpacity={0.85}
          onPress={onPress}
        >
          <Text style={S.heroCtaText}>Rezervasyon Yap</Text>
          <Ionicons name="arrow-forward" size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

    </TouchableOpacity>
  );
}

// ─── Club card ────────────────────────────────────────────────────────────────

type ClubCardProps = {
  club:    Club;
  courts:  ClubCourt[];
  theme:   Theme;
  onPress: () => void;
};

function ClubCard({ club, courts, theme, onPress }: ClubCardProps) {
  const { colorScheme } = useTheme();
  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme, colorScheme]);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[S.card, { backgroundColor: c.surface.card, borderColor: c.border.default }]}
    >
      {/* Hero image */}
      <View style={S.imageWrapper}>
        <Image
          source={{ uri: club.imageUrl }}
          style={S.clubImage}
          resizeMode="cover"
        />
        <View style={S.imageOverlay} />
        <View style={S.courtCountBadge}>
          <Ionicons name="tennisball-outline" size={12} color="#FFFFFF" />
          <Text style={S.courtCountText}>{courts.length} Kort</Text>
        </View>
      </View>

      {/* Info area */}
      <View style={S.infoArea}>
        <View style={S.nameRow}>
          <Text style={[S.clubName, { color: c.text.primary }]} numberOfLines={1}>
            {club.name}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={c.text.muted} />
        </View>

        <View style={S.addressRow}>
          <Ionicons name="location-outline" size={13} color={c.text.muted} />
          <Text style={[S.addressText, { color: c.text.muted }]} numberOfLines={1}>
            {club.address}
          </Text>
        </View>

        {/* Facility chips */}
        <View style={S.chipsRow}>
          {club.facilities.map((facility) => (
            <View
              key={facility}
              style={[S.chip, { backgroundColor: c.surface.raised }]}
            >
              <Text style={[S.chipText, { color: c.text.muted }]}>{facility}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ExploreScreen() {
  const navigation = useNavigation<ExploreNavProp>();
  const { theme, colorScheme } = useTheme();

  const [activeFilter, setActiveFilter] = useState<string>('Tümü');

  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme, colorScheme]);

  const handleFilterPress = (filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveFilter(filter);
  };

  return (
    <SafeAreaView style={[S.safeArea, { backgroundColor: c.background.secondary }]}>
      <ScrollView
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. Editorial header ──────────────────────────────────────── */}
        <Animated.View entering={slide(0)} style={S.headerSection}>
          <Text style={[S.greeting, { color: c.text.muted }]}>Merhaba, Mustafa 👋</Text>
          <Text style={[S.headerTitle, { color: c.text.primary }]}>
            Kortları{'\n'}Keşfet
          </Text>
        </Animated.View>

        {/* ── 2. Filter pills ──────────────────────────────────────────── */}
        <Animated.View entering={slide(80)} style={S.filterWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.filtersContent}
          >
            {FILTERS.map((filter) => {
              const isActive = filter === activeFilter;
              return (
                <TouchableOpacity
                  key={filter}
                  onPress={() => handleFilterPress(filter)}
                  activeOpacity={0.75}
                  style={[
                    S.filterPill,
                    {
                      backgroundColor: isActive ? c.accent.primary : c.surface.raised,
                      borderColor:     isActive ? c.accent.primary : c.border.default,
                    },
                  ]}
                >
                  <Text
                    style={[
                      S.filterPillText,
                      { color: isActive ? '#FFFFFF' : c.text.muted },
                    ]}
                  >
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── 3. Hero card ─────────────────────────────────────────────── */}
        <Animated.View entering={slide(160)} style={S.heroSection}>
          <HeroCard
            accentColor={c.accent.primary}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              navigation.navigate('BookingScreen', { clubId: CLUBS[0].id });
            }}
          />
        </Animated.View>

        {/* ── 4. Section label ─────────────────────────────────────────── */}
        <Animated.View entering={slide(240)} style={S.sectionLabelSection}>
          <Text style={[S.sectionLabel, { color: c.text.primary }]}>Tüm Kulüpler</Text>
        </Animated.View>

        {/* ── 5. Club feed ─────────────────────────────────────────────── */}
        {CLUBS.map((club, index) => (
          <Animated.View
            key={club.id}
            entering={slide(300 + index * 90)}
            style={S.cardSection}
          >
            <ClubCard
              club={club}
              courts={getCourtsByClubId(club.id)}
              theme={theme}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                navigation.navigate('BookingScreen', { clubId: club.id });
              }}
            />
          </Animated.View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

