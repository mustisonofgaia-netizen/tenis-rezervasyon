/**
 * ExploreScreen — Editorial club discovery feed.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { CompositeNavigationProp } from '@react-navigation/composite-navigation';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  FadeOut,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { PopularCourtsCarousel } from '../components/PopularCourtsCarousel';
import type { DeckCourt } from '../components/PopularCourtsCarousel';

import { CLUBS, getCourtsByClubId } from '../config/data';
import type { Club, ClubCourt } from '../config/data';
import type { ExploreStackParamList, RootTabParamList } from '../navigation/types';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import { fontSizes, fontWeights } from '../theme';
import type { ColorTokens } from '../theme/tokens';

type ExploreNavProp = CompositeNavigationProp<
  NativeStackNavigationProp<ExploreStackParamList, 'ExploreHome'>,
  BottomTabNavigationProp<RootTabParamList>
>;

type FilterOption = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 24;

const FILTERS: readonly FilterOption[] = [
  { label: 'Tümü', icon: 'grid-outline' },
  { label: 'Toprak Kort', icon: 'leaf-outline' },
  { label: 'Sert Zemin', icon: 'layers-outline' },
  { label: 'Kapalı Kort', icon: 'business-outline' },
  { label: 'Açık Kort', icon: 'sunny-outline' },
] as const;

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

const ANKARA_REGION = {
  latitude: 39.9334,
  longitude: 32.8597,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
} as const;

// Production Grade Distance Calculator (Haversine Formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

const DEFAULT_REGION = {
  latitude: 39.9334,
  longitude: 32.8597,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
} as const;

function makeStyles(c: ColorTokens, isDark: boolean) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 28,
      paddingBottom: 120,
    },
    headerSection: {
      paddingHorizontal: H_PAD,
      marginBottom: 24,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    headerLeft: {
      flex: 1,
      gap: 8,
    },
    weatherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    weatherText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      letterSpacing: 0.1,
    },
    greeting: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      letterSpacing: 0.1,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      marginLeft: 12,
    },
    avatarText: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.bold,
    },
    headerTitle: {
      fontSize: fontSizes['4xl'],
      fontWeight: fontWeights.extrabold,
      letterSpacing: -1.2,
      lineHeight: 42,
      marginBottom: 18,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 10,
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      padding: 0,
    },
    filterWrapper: {
      marginBottom: 24,
    },
    filtersContent: {
      paddingHorizontal: H_PAD,
      paddingVertical: 4,
      gap: 8,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 99,
      borderWidth: 1,
    },
    filterPillText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.semibold,
      letterSpacing: 0.1,
    },
    deckSection: {
      marginBottom: 28,
    },
    sectionHeader: {
      paddingHorizontal: H_PAD,
      marginBottom: 14,
    },
    sectionLabel: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.extrabold,
      letterSpacing: -0.4,
    },
    topRatedContainer: {
      paddingTop: 22,
      paddingBottom: 26,
      marginBottom: 12,
    },
    topRatedSection: {
      marginBottom: 0,
    },
    horizontalListContent: {
      paddingHorizontal: H_PAD,
      paddingBottom: 8,
      gap: 14,
    },
    horizontalCardWrapper: {
      width: 280,
    },
    cardSection: {
      paddingHorizontal: H_PAD,
      marginBottom: 16,
    },
    card: {
      borderRadius: 22,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
      borderWidth: StyleSheet.hairlineWidth,
    },
    imageWrapper: {
      height: 200,
      position: 'relative',
    },
    clubImage: {
      width: '100%',
      height: '100%',
    },
    imagePlaceholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    courtCountBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.60)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    courtCountText: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.bold,
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    infoArea: {
      padding: 18,
      gap: 8,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    clubName: {
      flex: 1,
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.extrabold,
      letterSpacing: -0.4,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addressText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      flex: 1,
    },
    distanceText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.bold,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    chip: {
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipText: {
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.semibold,
      letterSpacing: 0.1,
    },
    glassCard: {
      height: 200,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 4,
    },
    glassImagePlaceholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glassCourtBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.60)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    glassCourtText: {
      fontSize: 11,
      fontWeight: fontWeights.bold,
      color: '#FFFFFF',
    },
    glassInfoPanel: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      overflow: 'hidden',
      borderTopWidth: 1,
    },
    glassInfoInner: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    glassClubName: {
      fontSize: 14,
      fontWeight: fontWeights.extrabold,
      letterSpacing: -0.3,
    },
    glassAddressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    glassAddressText: {
      flex: 1,
      fontSize: 11,
      fontWeight: fontWeights.regular,
    },
    glassDistanceText: {
      fontSize: 11,
      fontWeight: fontWeights.bold,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 64,
      paddingHorizontal: H_PAD,
      gap: 16,
    },
    emptyIconCluster: {
      width: 88,
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyIconSlash: {
      position: 'absolute',
      bottom: 4,
      right: 6,
    },
    emptyStateTitle: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.extrabold,
      textAlign: 'center',
      letterSpacing: -0.5,
      lineHeight: 28,
    },
    emptyStateText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.medium,
      textAlign: 'center',
      letterSpacing: -0.1,
      lineHeight: 22,
      maxWidth: 280,
    },
    clearFiltersBtn: {
      marginTop: 8,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 14,
    },
    clearFiltersBtnText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.bold,
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    mapView: {
      flex: 1,
    },
    customMarker: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 99,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
      borderWidth: 1.5,
      borderColor: 'rgba(0,0,0,0.06)',
    },
    customMarkerSelected: {
      backgroundColor: '#0f172a',
      borderColor: 'transparent',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
    markerText: {
      fontSize: 11,
      fontWeight: fontWeights.bold,
      color: '#0f172a',
      maxWidth: 80,
    },
    markerTextSelected: {
      color: '#FFFFFF',
    },
    floatingCardOuter: {
      position: 'absolute',
      left: H_PAD,
      right: H_PAD,
      bottom: 170,
      zIndex: 9999,
      elevation: 100,
    },
    toggleWrapper: {
      position: 'absolute',
      bottom: 90,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 9999,
      elevation: 101,
    },
    toggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#0f172a',
      paddingHorizontal: 22,
      paddingVertical: 13,
      borderRadius: 99,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.30,
      shadowRadius: 12,
      elevation: 8,
    },
    toggleButtonText: {
      fontSize: fontSizes.sm,
      fontWeight: fontWeights.bold,
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
  });
}

function ImageBottomGradient() {
  return (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.85)']}
      locations={[0, 0.4, 1]}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    />
  );
}

type AnimatedSearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  colors: ColorTokens;
  styles: ReturnType<typeof makeStyles>;
};

function AnimatedSearchBar({ value, onChangeText, colors, styles: S }: AnimatedSearchBarProps) {
  const focused = useSharedValue(0);

  const handleFocus = useCallback(() => {
    focused.value = withTiming(1, { duration: 220 });
  }, [focused]);

  const handleBlur = useCallback(() => {
    focused.value = withTiming(0, { duration: 220 });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focused.value,
      [0, 1],
      [colors.border.default, colors.accent.primary],
    ),
    borderWidth: 1 + focused.value,
    shadowOpacity: focused.value * 0.15,
    shadowRadius: 4 + focused.value * 10,
    elevation: focused.value * 4,
  }));

  return (
    <Animated.View
      style={[
        S.searchBar,
        { backgroundColor: colors.surface.raised, shadowColor: colors.accent.primary },
        animatedStyle,
      ]}
    >
      <Ionicons name="search-outline" size={17} color={colors.text.muted} />
      <TextInput
        style={[S.searchInput, { color: colors.text.primary }]}
        placeholder="Tesis ara veya filtrele..."
        placeholderTextColor={colors.text.muted}
        value={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
      />
    </Animated.View>
  );
}

type ExploreEmptyStateProps = {
  isFiltering: boolean;
  onClearFilters: () => void;
  colors: ColorTokens;
  styles: ReturnType<typeof makeStyles>;
};

function ExploreEmptyState({ isFiltering, onClearFilters, colors, styles: S }: ExploreEmptyStateProps) {
  return (
    <View style={S.emptyState}>
      <View style={S.emptyIconCluster}>
        <Ionicons name="tennisball" size={56} color={colors.text.muted} style={{ opacity: 0.28 }} />
        <Ionicons
          name="close-circle"
          size={30}
          color={colors.status.warning}
          style={S.emptyIconSlash}
        />
      </View>

      <Text style={[S.emptyStateTitle, { color: colors.text.primary }]}>
        Kort bulunamadı
      </Text>
      <Text style={[S.emptyStateText, { color: colors.text.muted }]}>
        {isFiltering
          ? 'Arama veya filtre kriterlerinize uygun bir tesis yok. Farklı bir seçim deneyin.'
          : 'Şu an listelenecek tesis bulunmuyor.'}
      </Text>

      {isFiltering && (
        <TouchableOpacity
          style={[S.clearFiltersBtn, { backgroundColor: colors.accent.primary }]}
          activeOpacity={0.85}
          onPress={onClearFilters}
        >
          <Text style={S.clearFiltersBtnText}>Filtreleri Temizle</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

type ClubCardProps = {
  club: Club;
  courts: ClubCourt[];
  theme: Theme;
  distance: string;
  onPress: () => void;
  glass?: boolean;
};

function ClubCard({ club, courts, theme, distance, onPress, glass = false }: ClubCardProps) {
  const { colorScheme } = useTheme();
  const c = theme.colors;
  const isDark = colorScheme === 'dark';
  const S = useMemo(() => makeStyles(c, isDark), [theme, isDark]);
  const [imageLoaded, setImageLoaded] = useState(false);

  if (glass) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={[S.glassCard, { borderColor: c.border.default }]}>
        {!imageLoaded && (
          <View style={[S.glassImagePlaceholder, { backgroundColor: c.surface.raised }]}>
            <Ionicons name="tennisball-outline" size={32} color={c.text.muted} style={{ opacity: 0.22 }} />
          </View>
        )}
        <ImageBackground
          source={{ uri: club.imageUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onLoad={() => setImageLoaded(true)}
        />
        <ImageBottomGradient />

        <View style={S.glassCourtBadge}>
          <Ionicons name="tennisball-outline" size={12} color="#FFFFFF" />
          <Text style={S.glassCourtText}>{courts.length} Kort</Text>
        </View>

        {/* Dynamic Theme Token Adaptation for True Glassmorphism */}
        <BlurView
          intensity={90}
          tint={isDark ? 'dark' : 'light'}
          style={[S.glassInfoPanel, { backgroundColor: isDark ? 'rgba(15,23,42,0.65)' : 'rgba(255,255,255,0.75)', borderTopColor: c.border.default }]}
        >
          <View style={S.glassInfoInner}>
            <Text style={[S.glassClubName, { color: c.text.primary }]} numberOfLines={1}>{club.name}</Text>
            <View style={S.glassAddressRow}>
              <Ionicons name="location-outline" size={11} color={c.text.muted} />
              <Text style={[S.glassAddressText, { color: c.text.muted }]} numberOfLines={1}>{club.address}</Text>
              <Text style={[S.glassDistanceText, { color: c.accent.primary }]}>{distance}</Text>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[S.card, { backgroundColor: c.surface.card, borderColor: c.border.default }]}
    >
      <View style={S.imageWrapper}>
        {!imageLoaded && (
          <View style={[S.imagePlaceholder, { backgroundColor: c.surface.raised }]}>
            <Ionicons name="tennisball-outline" size={36} color={c.text.muted} style={{ opacity: 0.22 }} />
          </View>
        )}
        <Image
          source={{ uri: club.imageUrl }}
          style={[S.clubImage, !imageLoaded && { opacity: 0 }]}
          resizeMode="cover"
          onLoad={() => setImageLoaded(true)}
        />
        <ImageBottomGradient />
        <View style={S.courtCountBadge}>
          <Ionicons name="tennisball-outline" size={12} color="#FFFFFF" />
          <Text style={S.courtCountText}>{courts.length} Kort</Text>
        </View>
      </View>

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

export function ExploreScreen() {
  const navigation = useNavigation<ExploreNavProp>();
  const { theme, colorScheme } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(FILTERS[0].label);

  const [isMapView, setIsMapView] = useState(false);
  const [locationPermissionResolved, setLocationPermissionResolved] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [selectedMapClub, setSelectedMapClub] = useState<Club | null>(null);
  const [popupClub, setPopupClub] = useState<Club | null>(null);
  const popupClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const mapRef = useRef<any>(null);

  const cardY = useSharedValue(300);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    let cameraTimer: ReturnType<typeof setTimeout> | null = null;

    if (selectedMapClub) {
      if (popupClearRef.current) clearTimeout(popupClearRef.current);
      setPopupClub(selectedMapClub);
      cardY.value = withSpring(0, { damping: 18, stiffness: 200 });
      cardOpacity.value = withTiming(1, { duration: 200 });
      // Defer animateCamera so the Fabric UIManager finishes committing the
      // MapView's native tag before the imperative call fires — prevents the
      // "Unable to find view for viewState" Reanimated crash on Android.
      cameraTimer = setTimeout(() => {
        mapRef.current?.animateCamera(
          { center: { latitude: selectedMapClub.latitude, longitude: selectedMapClub.longitude }, zoom: 15 },
          { duration: 700 },
        );
      }, 150);
    } else {
      cardY.value = withTiming(300, { duration: 280, easing: Easing.in(Easing.cubic) });
      cardOpacity.value = withTiming(0, { duration: 220 });
      popupClearRef.current = setTimeout(() => setPopupClub(null), 310);
    }
    return () => {
      if (cameraTimer) clearTimeout(cameraTimer);
      if (popupClearRef.current) clearTimeout(popupClearRef.current);
    };
  }, [selectedMapClub]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));

  const c = theme.colors;
  const isDark = colorScheme === 'dark';
  const S = useMemo(() => makeStyles(c, isDark), [theme, isDark]);

  const isFiltering = searchQuery.trim().length > 0 || activeFilter !== FILTERS[0].label;

  const handleFilterPress = (filter: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setActiveFilter(filter);
  };

  const handleClearFilters = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setSearchQuery('');
    setActiveFilter(FILTERS[0].label);
  }, []);

  const handleToggleMapView = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    if (!isMapView) {
      Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status === 'granted') {
            setLocationPermissionGranted(true);
            return Location.getCurrentPositionAsync({});
          }
          throw new Error('Permission denied');
        })
        .then((loc) => {
          setUserLocation(loc);
        })
        .catch(() => { })
        .finally(() => {
          setLocationPermissionResolved(true);
          setIsMapView(true);
        });
    } else {
      setIsMapView(false);
      setLocationPermissionResolved(false);
      setLocationPermissionGranted(false);
      setSelectedMapClub(null);
    }
  }, [isMapView]);

  const topRatedClubs = CLUBS.slice(0, 3);

  const filteredClubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CLUBS.filter((club) => {
      const matchesSearch =
        q === '' ||
        club.name.toLowerCase().includes(q) ||
        club.address.toLowerCase().includes(q);
      const matchesSurface =
        activeFilter === FILTERS[0].label || club.surfaces.includes(activeFilter);
      return matchesSearch && matchesSurface;
    });
  }, [searchQuery, activeFilter]);

  // Production Ready Live Distance Mapping Engine
  const getClubDistance = useCallback((club: Club) => {
    if (userLocation) {
      return calculateDistance(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        club.latitude,
        club.longitude
      );
    }
    return MOCK_DISTANCE_MAP[club.id] ?? '—';
  }, [userLocation]);

  return (
    <SafeAreaView style={[S.safeArea, { backgroundColor: c.background.secondary }]}>
      <View style={{ flex: 1 }}>

        {!isMapView && (
          <ScrollView
            contentContainerStyle={S.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={slide(0)} style={S.headerSection}>
              <View style={S.headerTopRow}>
                <View style={S.headerLeft}>
                  <Text style={[S.greeting, { color: c.text.primary }]}>Merhaba, Mustafa 👋</Text>
                  <View style={S.weatherRow}>
                    <Ionicons name="sunny-outline" size={14} color={c.text.muted} />
                    <Text style={[S.weatherText, { color: c.text.muted }]}>
                      24°C · Açık kortlar için harika
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                    navigation.navigate('Profile');
                  }}
                  style={[S.avatar, { backgroundColor: c.surface.raised, borderColor: c.accent.primary }]}
                >
                  <Text style={[S.avatarText, { color: c.accent.primary }]}>M</Text>
                </TouchableOpacity>
              </View>

              <Text style={[S.headerTitle, { color: c.text.primary }]}>
                Kortları{'\n'}Keşfet
              </Text>

              <AnimatedSearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                colors={c}
                styles={S}
              />
            </Animated.View>

            <Animated.View entering={slide(80)} style={S.filterWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={S.filtersContent}
              >
                {FILTERS.map((filter) => {
                  const isActive = filter.label === activeFilter;
                  const iconColor = isActive ? '#FFFFFF' : c.text.muted;
                  return (
                    <TouchableOpacity
                      key={filter.label}
                      onPress={() => handleFilterPress(filter.label)}
                      activeOpacity={0.75}
                      style={[
                        S.filterPill,
                        {
                          backgroundColor: isActive ? c.accent.primary : c.surface.raised,
                          borderColor: isActive ? c.accent.primary : c.border.default,
                        },
                      ]}
                    >
                      <Ionicons name={filter.icon} size={14} color={iconColor} />
                      <Text style={[S.filterPillText, { color: isActive ? '#FFFFFF' : c.text.muted }]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Animated.View>

            {!isFiltering && (
              <>
                <Animated.View entering={slide(160)} exiting={FadeOutUp.duration(250)} style={S.sectionHeader}>
                  <Text style={[S.sectionLabel, { color: c.text.primary }]}>Popüler Kortlar</Text>
                </Animated.View>

                <Animated.View entering={slide(200)} exiting={FadeOutUp.duration(250)} style={S.deckSection}>
                  <PopularCourtsCarousel
                    accentColor={c.accent.primary}
                    onCardPress={(court: DeckCourt) => {
                      const clubIndex = parseInt(court.id, 10) - 1;
                      const club = CLUBS[Math.max(0, Math.min(clubIndex, CLUBS.length - 1))];
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
                      navigation.navigate('BookingScreen', { clubId: club.id });
                    }}
                  />
                </Animated.View>

                <Animated.View
                  entering={slide(240)}
                  exiting={FadeOutUp.duration(200)}
                  style={[S.topRatedContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.03)' }]}
                >
                  <View style={S.topRatedSection}>
                    <View style={S.sectionHeader}>
                      <Text style={[S.sectionLabel, { color: c.text.primary }]}>En Yüksek Puanlılar</Text>
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
                            distance={getClubDistance(club)}
                            glass
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                              navigation.navigate('BookingScreen', { clubId: club.id });
                            }}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </Animated.View>
              </>
            )}

            <Animated.View entering={slide(320)} layout={LinearTransition.springify().mass(0.8)} style={S.sectionHeader}>
              <Text style={[S.sectionLabel, { color: c.text.primary }]}>Tüm Tesisler</Text>
            </Animated.View>

            {filteredClubs.length === 0 ? (
              <ExploreEmptyState isFiltering={isFiltering} onClearFilters={handleClearFilters} colors={c} styles={S} />
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
                    distance={getClubDistance(club)}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                      navigation.navigate('BookingScreen', { clubId: club.id });
                    }}
                  />
                </Animated.View>
              ))
            )}
          </ScrollView>
        )}

        {isMapView && !locationPermissionResolved && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background.secondary, alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={c.accent.primary} />
          </View>
        )}

        {isMapView && locationPermissionResolved && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={S.mapView}
              initialRegion={DEFAULT_REGION}
              showsUserLocation={locationPermissionGranted}
              showsMyLocationButton={locationPermissionGranted}
              onPress={() => setSelectedMapClub(null)}
            >
              {CLUBS.map((club) => (
                <Marker
                  key={club.id}
                  coordinate={{ latitude: club.latitude, longitude: club.longitude }}
                  tracksViewChanges={selectedMapClub?.id === club.id}
                  stopPropagation
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                    setSelectedMapClub(club);
                  }}
                >
                  <View style={[S.customMarker, selectedMapClub?.id === club.id && S.customMarkerSelected]}>
                    <Ionicons
                      name="tennisball"
                      size={13}
                      color={selectedMapClub?.id === club.id ? '#FFFFFF' : c.accent.primary}
                    />
                    <Text style={[S.markerText, selectedMapClub?.id === club.id && S.markerTextSelected]} numberOfLines={1}>
                      {club.name.split(' ')[0]}
                    </Text>
                  </View>
                </Marker>
              ))}
            </MapView>

            <Animated.View style={[S.floatingCardOuter, cardAnimStyle]} pointerEvents={popupClub ? 'auto' : 'none'}>
              {popupClub && (
                <ClubCard
                  club={popupClub}
                  courts={getCourtsByClubId(popupClub.id)}
                  theme={theme}
                  distance={getClubDistance(popupClub)}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
                    navigation.navigate('BookingScreen', { clubId: popupClub.id });
                  }}
                />
              )}
            </Animated.View>
          </View>
        )}

        <View style={S.toggleWrapper} pointerEvents="box-none">
          <TouchableOpacity style={S.toggleButton} activeOpacity={0.85} onPress={handleToggleMapView}>
            <Ionicons name={isMapView ? 'list' : 'map-outline'} size={16} color="#FFFFFF" />
            <Text style={S.toggleButtonText}>{isMapView ? 'Liste' : 'Harita'}</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}