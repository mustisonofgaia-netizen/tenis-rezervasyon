import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { CLUBS, getCourtsByClubId } from '../config/data';
import type { Club, ClubCourt } from '../config/data';
import type { ExploreStackParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExploreNavProp = NativeStackNavigationProp<ExploreStackParamList, 'ExploreHome'>;

// ─── Club card ────────────────────────────────────────────────────────────────

type ClubCardProps = {
  club: Club;
  courts: ClubCourt[];
  onPress: () => void;
};

function ClubCard({ club, courts, onPress }: ClubCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={styles.card}
    >
      {/* ── Hero image ─────────────────────────────── */}
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: club.imageUrl }}
          style={styles.heroImage}
          resizeMode="cover"
        />
        {/* Subtle dark gradient overlay at bottom of image */}
        <View style={styles.imageOverlay} />

        {/* Court count pill — top-right */}
        <View style={styles.courtCountBadge}>
          <Ionicons name="tennisball-outline" size={12} color="#FFFFFF" />
          <Text style={styles.courtCountText}>{courts.length} Kort</Text>
        </View>
      </View>

      {/* ── Club info ───────────────────────────────── */}
      <View style={styles.infoArea}>
        <View style={styles.nameRow}>
          <Text style={styles.clubName} numberOfLines={1}>
            {club.name}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </View>

        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={13} color="#9CA3AF" />
          <Text style={styles.addressText} numberOfLines={1}>
            {club.address}
          </Text>
        </View>

        {/* ── Facilities pills ─────────────────────── */}
        <View style={styles.pillsRow}>
          {club.facilities.map((facility) => (
            <View key={facility} style={styles.pill}>
              <Text style={styles.pillText}>{facility}</Text>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.headerArea}>
          <Text style={styles.headerTitle}>Kulüpleri Keşfet</Text>
          <Text style={styles.headerSubtitle}>
            Sizi bekleyen kortları bulun ve rezervasyon yapın
          </Text>
        </View>

        {/* ── Club feed ──────────────────────────────── */}
        {CLUBS.map((club) => (
          <ClubCard
            key={club.id}
            club={club}
            courts={getCourtsByClubId(club.id)}
            onPress={() =>
              navigation.navigate('BookingScreen', { clubId: club.id })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 120,
    gap: 20,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  headerArea: {
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    fontWeight: '400',
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },

  // ── Hero image ────────────────────────────────────────────────────────────
  imageWrapper: {
    height: 200,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  courtCountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  courtCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ── Info area ─────────────────────────────────────────────────────────────
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
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    flex: 1,
  },

  // ── Facilities pills ───────────────────────────────────────────────────────
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.1,
  },
});
