import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COURTS } from '../config/courts';
import type { CourtConfig, CourtId } from '../types/booking';

type CourtPickerProps = {
  selectedCourtId: CourtId;
  onSelectCourt: (courtId: CourtId) => void;
  /** Optional live prices — falls back to basePrice from config */
  livePrices?: Partial<Record<string, number>>;
  /**
   * Explicit list of courts to display.
   * When omitted the global COURTS array is used (backward-compatible default).
   */
  courts?: CourtConfig[];
};

export function CourtPicker({
  selectedCourtId,
  onSelectCourt,
  livePrices,
  courts: courtsProp,
}: CourtPickerProps) {
  const courtsToShow = courtsProp ?? COURTS;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
    >
      {courtsToShow.map((item) => {
        const isSelected = item.id === selectedCourtId;
        const price = livePrices?.[item.id] ?? item.basePrice;

        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.75}
            onPress={() => onSelectCourt(item.id)}
            style={[styles.card, isSelected && styles.cardSelected]}
          >
            <View style={styles.cardTop}>
              <Text
                style={[styles.courtName, isSelected && styles.courtNameSelected]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {isSelected && <View style={styles.activeDot} />}
            </View>
            <Text style={[styles.details, isSelected && styles.detailsSelected]}>
              {item.surface} · {item.courtType}
            </Text>
            <Text style={[styles.price, isSelected && styles.priceSelected]}>
              {price.toLocaleString('tr-TR')} TL
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 4,
  },

  card: {
    minWidth: 148,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },

  courtName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    letterSpacing: -0.2,
  },
  courtNameSelected: {
    color: '#15803D',
  },

  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },

  details: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    letterSpacing: 0.1,
  },
  detailsSelected: {
    color: '#4ADE80',
  },

  price: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  priceSelected: {
    color: '#15803D',
  },
});
