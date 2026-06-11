import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { SlotInfo, SlotStatus } from '../types/booking';

type TimeSlotGridProps = {
  slots: SlotInfo[];
  onSelectSlot: (slot: string) => void;
};

function isSelectable(status: SlotStatus): boolean {
  return status === 'FREE';
}

function getStatusLabel(status: SlotStatus): string | null {
  if (status === 'CONFIRMED') return 'Dolu';
  if (status === 'LOCKED') return 'Kilitli';
  if (status === 'BLOCKED') return 'Kapalı';
  return null;
}

export function TimeSlotGrid({ slots, onSelectSlot }: TimeSlotGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const handlePress = (slot: SlotInfo) => {
    if (!isSelectable(slot.status)) {
      return;
    }

    setSelectedSlot(slot.time);
    onSelectSlot(slot.time);
  };

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const isSelected = slot.time === selectedSlot;
        const isDisabled = !isSelectable(slot.status);
        const statusLabel = getStatusLabel(slot.status);

        return (
          <TouchableOpacity
            key={slot.time}
            activeOpacity={isDisabled ? 1 : 0.7}
            disabled={isDisabled}
            onPress={() => handlePress(slot)}
            style={[
              styles.slot,
              isSelected && styles.slotSelected,
              slot.status === 'LOCKED' && styles.slotLocked,
              slot.status === 'CONFIRMED' && styles.slotBooked,
              slot.status === 'BLOCKED' && styles.slotBlocked,
            ]}
          >
            <Text
              style={[
                styles.slotText,
                isSelected && styles.slotTextSelected,
                isDisabled && styles.slotTextDisabled,
              ]}
            >
              {slot.time}
            </Text>
            {statusLabel ? (
              <Text style={styles.statusLabel}>{statusLabel}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const GAP = 10;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slot: {
    width: '32%',
    marginBottom: GAP,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotSelected: {
    backgroundColor: '#22C55E',
  },
  slotLocked: {
    backgroundColor: '#FEF3C7',
  },
  slotBooked: {
    backgroundColor: '#E5E7EB',
    opacity: 0.75,
  },
  slotBlocked: {
    backgroundColor: '#1F2937',
    opacity: 0.7,
  },
  slotText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: 0.2,
  },
  slotTextSelected: {
    color: '#FFFFFF',
  },
  slotTextDisabled: {
    color: '#9CA3AF',
  },
  statusLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
