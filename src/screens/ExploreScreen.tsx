/**
 * ExploreScreen — Editorial club discovery feed.
 *
 * Sections (top → bottom):
 *  1. Editorial header  — weather widget · personalised greeting · hero title · search bar
 *  2. Horizontal pills  — single-select filter row
 *  3. Hero image card   — full-bleed photo, gradient, rating badge, CTA
 *  4. Top Rated         — horizontal scroll of top-3 clubs
 *  5. All clubs feed    — themed ClubCard vertical list
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { useMemo, useState } from 'react';
import {
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

const FILTERS = ['Tümü', 'Toprak Kort', 'Sert Zemin', 'Kapalı Kort', 'Açık Kort'] as const;

const HERO_IMAGE_URI =
  'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&q=80';

// Stable mock distances keyed by club ID so they survive filter reorders
const MOCK_DISTANCE_MAP: Record<string, string> = {
  club_1: '1.2 km',
  club_2: '2.4 km',
  club_3: '3.7 km',
  club_4: '5.1 km',
  club_5: '6.8 km',
  club_6: '8.2 km',
};

const slide = (delay: number) =>
  FadeInDown.delay(delay).duration(480).easing(Easing.out(Easing.cubic));

// ─── Theme-aware style factory ────────────────────────────────────────────────
// Structural styles only — all colour values are injected inline from the theme.

function makeStyles(_c: ColorTokens, _isDark: boolean) {
  return StyleSheet.create({

    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingTop:    28,
      paddingBottom: 120,
    },

    // ── Header ─────────────────────────────────────────────────────────────
    headerSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      24,
    },
    weatherRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           6,
      marginBottom:  15,
    },
    weatherText: {
      fontSize:      fontSizes.sm,
      fontWeight:    fontWeights.medium,
      letterSpacing: 0.1,
    },
    greeting: {
      fontSize:      fontSizes.sm,
      fontWeight:    fontWeights.medium,
      marginBottom:  6,
      letterSpacing: 0.1,
    },
    headerTitle: {
      fontSize:      fontSizes['4xl'],
      fontWeight:    fontWeights.extrabold,
      letterSpacing: -1.2,
      lineHeight:    42,
      marginBottom:  18,
    },
    searchBar: {
      flexDirection:     'row',
      alignItems:        'center',
      borderRadius:      16,
      paddingHorizontal: 14,
      paddingVertical:   11,
      gap:               10,
    },
    searchInput: {
      flex:       1,
      fontSize:   fontSizes.sm,
      fontWeight: fontWeights.medium,
      padding:    0,
    },

    // ── Filter pills ───────────────────────────────────────────────────────
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

    // ── Hero card ──────────────────────────────────────────────────────────
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

    // ── Section header ─────────────────────────────────────────────────────
    sectionHeader: {
      paddingHorizontal: H_PAD,
      marginBottom:      14,
    },
    sectionLabel: {
      fontSize:      fontSizes.xl,
      fontWeight:    fontWeights.extrabold,
      letterSpacing: -0.4,
    },

    // ── Top Rated horizontal list ──────────────────────────────────────────
    topRatedSection: {
      marginBottom: 28,
    },
    horizontalListContent: {
      paddingHorizontal: H_PAD,
      paddingBottom:     8,
      gap:               14,
    },
    horizontalCardWrapper: {
      width: 280,
    },

    // ── Vertical club feed ─────────────────────────────────────────────────
    cardSection: {
      paddingHorizontal: H_PAD,
      marginBottom:      16,
    },

    // ── ClubCard ───────────────────────────────────────────────────────────
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
    distanceText: {
      fontSize:   fontSizes.sm,
      fontWeight: fontWeights.bold,
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

    // ── Empty state ────────────────────────────────────────────────────────
    emptyState: {
      alignItems:        'center',
      paddingVertical:   56,
      paddingHorizontal: H_PAD,
      gap:               14,
    },
    emptyStateText: {
      fontSize:      fontSizes.base,
      fontWeight:    fontWeights.semibold,
      textAlign:     'center',
      letterSpacing: -0.2,
      lineHeight:    22,
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

      <ImageBackground
        source={{ uri: HERO_IMAGE_URI }}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      <View style={[StyleSheet.absoluteFillObject, S.heroOverlay]} />

      <View style={S.ratingBadge}>
        <Text style={S.ratingText}>⭐  4.8</Text>
      </View>

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
  club:     Club;
  courts:   ClubCourt[];
  theme:    Theme;
  distance: string;
  onPress:  () => void;
};

function ClubCard({ club, courts, theme, distance, onPress }: ClubCardProps) {
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
          <Text style={[S.distanceText, { color: c.accent.primary }]}>{distance}</Text>
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

  const [searchQuery, setSearchQuery]   = useState('');
  const [activeFilter, setActiveFilter] = useState('Tümü');

  const c = theme.colors;
  const S = useMemo(() => makeStyles(c, colorScheme === 'dark'), [theme, colorScheme]);

  // True whenever the user has typed a query or selected a non-default pill
  const isFiltering = searchQuery.trim().length > 0 || activeFilter !== 'Tümü';

  const handleFilterPress = (filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActiveFilter(filter);
  };

  // Top-rated strip is always the first 3 clubs, unaffected by filters
  const topRatedClubs = CLUBS.slice(0, 3);

  // Client-side derived list — search query + surface pill filter
  const filteredClubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CLUBS.filter((club) => {
      const matchesSearch =
        q === '' ||
        club.name.toLowerCase().includes(q) ||
        club.address.toLowerCase().includes(q);
      const matchesSurface =
        activeFilter === 'Tümü' || club.surfaces.includes(activeFilter);
      return matchesSearch && matchesSurface;
    });
  }, [searchQuery, activeFilter]);

  return (
    <SafeAreaView style={[S.safeArea, { backgroundColor: c.background.secondary }]}>
      <ScrollView
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── 1. Editorial header ──────────────────────────────────────── */}
        <Animated.View entering={slide(0)} style={S.headerSection}>

          {/* Weather widget */}
          <View style={S.weatherRow}>
            <Ionicons name="sunny-outline" size={14} color={c.text.muted} />
            <Text style={[S.weatherText, { color: c.text.muted }]}>
              24°C · Açık kortlar için harika
            </Text>
          </View>

          {/* Personalised greeting */}
          <Text style={[S.greeting, { color: c.text.muted }]}>Merhaba, Mustafa 👋</Text>

          {/* Hero title */}
          <Text style={[S.headerTitle, { color: c.text.primary }]}>
            Kortları{'\n'}Keşfet
          </Text>

          {/* Search bar */}
          <View style={[S.searchBar, { backgroundColor: c.surface.raised }]}>
            <Ionicons name="search-outline" size={17} color={c.text.muted} />
            <TextInput
              style={[S.searchInput, { color: c.text.primary }]}
              placeholder="Tesis veya semt ara..."
              placeholderTextColor={c.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

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

        {/* ── 3 & 4. Promotional block — hidden while filtering ────────── */}
        {!isFiltering && (
          <>
            {/* Hero card */}
            <Animated.View
              entering={slide(160)}
              exiting={FadeOutUp.duration(250)}
              style={S.heroSection}
            >
              <HeroCard
                accentColor={c.accent.primary}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  navigation.navigate('BookingScreen', { clubId: CLUBS[0].id });
                }}
              />
            </Animated.View>

            {/* Top Rated — horizontal scroll */}
            <Animated.View
              entering={slide(240)}
              exiting={FadeOutUp.duration(200)}
              style={S.topRatedSection}
            >
              <View style={S.sectionHeader}>
                <Text style={[S.sectionLabel, { color: c.text.primary }]}>
                  En Yüksek Puanlılar
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={S.horizontalListContent}
              >
                {topRatedClubs.map((club) => (
                  <View key={club.id} style={S.horizontalCardWrapper}>
                    <ClubCard
                      club={club}
                      courts={getCourtsByClubId(club.id)}
                      theme={theme}
                      distance={MOCK_DISTANCE_MAP[club.id] ?? '—'}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        navigation.navigate('BookingScreen', { clubId: club.id });
                      }}
                    />
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </>
        )}

        {/* ── 5. All clubs — section label ─────────────────────────────── */}
        <Animated.View
          entering={slide(320)}
          layout={LinearTransition.springify().mass(0.8)}
          style={S.sectionHeader}
        >
          <Text style={[S.sectionLabel, { color: c.text.primary }]}>Tüm Tesisler</Text>
        </Animated.View>

        {/* ── 6. Club feed (vertical) — driven by filteredClubs ─────────── */}
        {filteredClubs.length === 0 ? (
          <View style={S.emptyState}>
            <Ionicons name="search-outline" size={44} color={c.text.muted} />
            <Text style={[S.emptyStateText, { color: c.text.secondary }]}>
              Bu kriterlere uygun{'\n'}kort bulunamadı.
            </Text>
          </View>
        ) : (
          filteredClubs.map((club, index) => (
            <Animated.View
              key={club.id}
              entering={slide(380 + index * 90)}
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.springify().mass(0.8)}
              style={S.cardSection}
            >
              <ClubCard
                club={club}
                courts={getCourtsByClubId(club.id)}
                theme={theme}
                distance={MOCK_DISTANCE_MAP[club.id] ?? '—'}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  navigation.navigate('BookingScreen', { clubId: club.id });
                }}
              />
            </Animated.View>
          ))
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
