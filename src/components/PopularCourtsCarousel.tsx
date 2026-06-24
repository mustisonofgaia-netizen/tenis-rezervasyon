/**
 * PopularCourtsCarousel — Apple App Store-style horizontal snap carousel.
 *
 * Architecture:
 *  - Animated.FlatList with snapToInterval + decelerationRate="fast" for crisp paging.
 *  - useAnimatedScrollHandler tracks contentOffset.x on the UI thread (no JS bridge round-trip).
 *  - Each CarouselCard receives the shared scrollX value and drives its own scale (1→0.9)
 *    and opacity (1→0.7) via useAnimatedStyle — fully on the UI thread.
 *  - contentContainerStyle paddingHorizontal centres the first and last card in the viewport.
 *  - Frosted-glass info panel uses rgba(255,255,255,0.90) to simulate blur without expo-blur.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import {
  Dimensions,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ListRenderItem } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CARD_WIDTH    = SCREEN_WIDTH * 0.85;
const        CARD_HEIGHT   = 268;
const        CARD_GAP      = 14;
export const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

// Horizontal padding so the first and last card appear centred in the viewport.
// When scroll offset = i * SNAP_INTERVAL, card i is exactly centred.
const H_PAD = (SCREEN_WIDTH - CARD_WIDTH) / 2;

// ─── Mock data ────────────────────────────────────────────────────────────────

export type DeckCourt = {
  id:       string;
  name:     string;
  location: string;
  rating:   number;
  image:    string;
};

export const DECK_COURTS: DeckCourt[] = [
  {
    id:       '1',
    name:     'Midas Tenis Kulübü',
    location: 'Merkez, Ankara',
    rating:   4.8,
    image:    'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&q=80',
  },
  {
    id:       '2',
    name:     'Ankara Tenis Akademisi (ATK)',
    location: 'Yenimahalle, Ankara',
    rating:   4.9,
    image:    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
  },
  {
    id:       '3',
    name:     'ODTÜ Tenis Kortları',
    location: 'Çankaya, Ankara',
    rating:   4.7,
    image:    'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&q=80',
  },
];

// ─── CarouselCard ─────────────────────────────────────────────────────────────

type CarouselCardProps = {
  court:       DeckCourt;
  index:       number;
  scrollX:     SharedValue<number>;
  accentColor: string;
  onPress:     () => void;
};

function CarouselCard({ court, index, scrollX, accentColor, onPress }: CarouselCardProps) {
  const animStyle = useAnimatedStyle(() => {
    // Normalised distance from the viewport centre: 0 = centred, ±1 = one card away.
    const dist    = (scrollX.value - index * SNAP_INTERVAL) / SNAP_INTERVAL;
    const clamped = Math.max(-1, Math.min(1, dist));
    const abs     = Math.abs(clamped);
    // Centred card:  scale 1.00,  opacity 1.0
    // Adjacent card: scale 0.90,  opacity 0.7
    return {
      transform: [{ scale: 1 - abs * 0.10 }],
      opacity:   1 - abs * 0.30,
    };
  });

  return (
    <Animated.View style={[styles.cardWrapper, animStyle]}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={styles.card}
      >
        <ImageBackground
          source={{ uri: court.image }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.cardOverlay} />

        {/* Rating badge */}
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>⭐  {court.rating}</Text>
        </View>

        {/* Frosted-glass info panel — solid semi-opaque white simulates the blur tint */}
        <View style={styles.glassContent}>
          <View style={styles.glassContentInner}>
            <View style={styles.infoRow}>
              <View style={styles.infoText}>
                <Text style={styles.courtName} numberOfLines={1}>{court.name}</Text>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={12} color="rgba(15,23,42,0.55)" />
                  <Text style={styles.courtLocation} numberOfLines={1}>{court.location}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.ctaButton, { backgroundColor: accentColor }]}
                activeOpacity={0.85}
                onPress={onPress}
              >
                <Text style={styles.ctaText}>Rezervasyon Yap</Text>
                <Ionicons name="arrow-forward" size={13} color="#FFF" style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            </View>

            <View style={styles.scrollHint}>
              <Ionicons name="chevron-back-outline"    size={11} color="rgba(15,23,42,0.35)" />
              <Text style={styles.scrollHintText}>Popüler kortları keşfet</Text>
              <Ionicons name="chevron-forward-outline" size={11} color="rgba(15,23,42,0.35)" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── PopularCourtsCarousel ────────────────────────────────────────────────────

type PopularCourtsCarouselProps = {
  accentColor: string;
  onCardPress: (court: DeckCourt) => void;
};

export function PopularCourtsCarousel({ accentColor, onCardPress }: PopularCourtsCarouselProps) {
  const scrollX = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollX.value = event.contentOffset.x;
    },
  });

  const renderItem: ListRenderItem<DeckCourt> = useCallback(
    ({ item, index }) => (
      <CarouselCard
        court={item}
        index={index}
        scrollX={scrollX}
        accentColor={accentColor}
        onPress={() => onCardPress(item)}
      />
    ),
    [accentColor, onCardPress, scrollX],
  );

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={DECK_COURTS}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Crisp snap: each card snaps to its centred position
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        // contentContainerStyle centres the first/last card; gap separates items
        contentContainerStyle={styles.listContent}
        // ItemSeparatorComponent drives the CARD_GAP reliably across all RN versions
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        // Throttle ensures the Reanimated worklet fires at native frame rate
        scrollEventThrottle={16}
        onScroll={onScroll}
        initialNumToRender={DECK_COURTS.length}
        // Allow the FlatList to scroll independently inside the parent vertical ScrollView
        nestedScrollEnabled
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: CARD_HEIGHT,
  },

  listContent: {
    paddingHorizontal: H_PAD,
  },

  separator: {
    width: CARD_GAP,
  },

  cardWrapper: {
    width:  CARD_WIDTH,
    height: CARD_HEIGHT,
  },

  card: {
    flex:          1,
    borderRadius:  24,
    overflow:      'hidden',
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius:  24,
    elevation:     10,
  },

  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },

  // ── Rating badge ─────────────────────────────────────────────────────────
  ratingBadge: {
    position:          'absolute',
    top:               14,
    right:             14,
    backgroundColor:   'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
    zIndex:            10,
  },
  ratingText: {
    fontSize:      12,
    fontWeight:    '700',
    color:         '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Frosted-glass info panel (BlurView-free fallback) ────────────────────
  glassContent: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    // rgba(255,255,255,0.90) simulates a frosted-glass tint without native blur
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderTopWidth:  1,
    borderTopColor:  'rgba(0, 0, 0, 0.08)',
  },
  glassContentInner: {
    padding:    18,
    paddingTop: 14,
    gap:        8,
  },
  infoRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            12,
  },
  infoText: {
    flex: 1,
    gap:  4,
  },
  courtName: {
    fontSize:      18,
    fontWeight:    '800',
    color:         '#0f172a',
    letterSpacing: -0.4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
  },
  courtLocation: {
    fontSize:   13,
    fontWeight: '500',
    color:      'rgba(15, 23, 42, 0.60)',
  },
  ctaButton: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   9,
    borderRadius:      14,
    flexShrink:        0,
  },
  ctaText: {
    fontSize:      13,
    fontWeight:    '700',
    color:         '#FFFFFF',
    letterSpacing: 0.1,
  },

  // ── Scroll hint ───────────────────────────────────────────────────────────
  scrollHint: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            5,
  },
  scrollHintText: {
    fontSize:   11,
    fontWeight: '500',
    color:      'rgba(15, 23, 42, 0.40)',
  },
});
