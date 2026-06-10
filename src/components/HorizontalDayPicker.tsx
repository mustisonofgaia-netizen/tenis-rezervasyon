import { useMemo } from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const TURKISH_DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
const DAY_COUNT = 14;

export type DayItem = {
  id: string;
  dayName: string;
  dayNumber: number;
};

type HorizontalDayPickerProps = {
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
};

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildUpcomingDays(count: number): DayItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      id: formatDateKey(date),
      dayName: TURKISH_DAY_NAMES[date.getDay()],
      dayNumber: date.getDate(),
    };
  });
}

export function HorizontalDayPicker({
  selectedDate,
  onSelectDate,
}: HorizontalDayPickerProps) {
  const days = useMemo(() => buildUpcomingDays(DAY_COUNT), []);

  const renderItem: ListRenderItem<DayItem> = ({ item }) => {
    const isSelected = item.id === selectedDate;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onSelectDate(item.id)}
        style={[styles.dayCard, isSelected && styles.dayCardSelected]}
      >
        <Text style={[styles.dayName, isSelected && styles.dayTextSelected]}>
          {item.dayName}
        </Text>
        <Text style={[styles.dayNumber, isSelected && styles.dayTextSelected]}>
          {item.dayNumber}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <FlatList
        data={days}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 4,
  },
  dayCard: {
    width: 56,
    marginRight: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCardSelected: {
    backgroundColor: '#22C55E',
  },
  dayName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
});
