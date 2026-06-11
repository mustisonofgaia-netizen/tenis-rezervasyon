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
  /** uid of the current authenticated user — enables own-lock detection */
  currentUserId?: string;
};

// A slot is selectable if it is FREE, or if the current user already holds its lock
function isSelectable(slot: SlotInfo, currentUserId: string | undefined): boolean {
  if (slot.status === 'FREE') return true;
  if (
    slot.status === 'LOCKED' &&
    currentUserId !== undefined &&
    slot.lockedBy === currentUserId
  ) {
    return true;
  }
  return false;
}

function getStatusLabel(
  slot: SlotInfo,
  currentUserId: string | undefined,
): string | null {
  switch (slot.status) {
    case 'CONFIRMED': return 'Dolu';
    case 'BLOCKED':   return 'Kapalı';
    case 'LOCKED':
      return slot.lockedBy === currentUserId ? '⏳ Sizin' : '⏳ İşlemde';
    default: return null;
  }
}

export function TimeSlotGrid({ slots, onSelectSlot, currentUserId }: TimeSlotGridProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const handlePress = (slot: SlotInfo) => {
    if (!isSelectable(slot, currentUserId)) return;
    setSelectedSlot(slot.time);
    onSelectSlot(slot.time);
  };

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const isSelected = slot.time === selectedSlot;
        const selectable = isSelectable(slot, currentUserId);
        const statusLabel = getStatusLabel(slot, currentUserId);
        const isOwnLock =
          slot.status === 'LOCKED' && slot.lockedBy === currentUserId;

        return (
          <TouchableOpacity
            key={slot.time}
            activeOpacity={selectable ? 0.7 : 1}
            disabled={!selectable}
            onPress={() => handlePress(slot)}
            style={[
              styles.slot,
              isSelected && styles.slotSelected,
              // Amber styles only apply when NOT selected (green overrides on selection)
              slot.status === 'LOCKED' && !isSelected && (
                isOwnLock ? styles.slotLockedOwn : styles.slotLocked
              ),
              slot.status === 'CONFIRMED' && styles.slotBooked,
              slot.status === 'BLOCKED' && styles.slotBlocked,
            ]}
          >
            <Text
              style={[
                styles.slotText,
                isSelected && styles.slotTextSelected,
                !selectable && !isOwnLock && styles.slotTextDisabled,
                slot.status === 'BLOCKED' && styles.slotTextBlocked,
              ]}
            >
              {slot.time}
            </Text>
            {statusLabel ? (
              <Text
                style={[
                  styles.statusLabel,
                  slot.status === 'LOCKED' && styles.statusLabelLocked,
                  isOwnLock && styles.statusLabelOwnLock,
                  slot.status === 'BLOCKED' && styles.statusLabelBlocked,
                ]}
              >
                {statusLabel}
              </Text>
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
  // Locked by another user — soft amber, disabled
  slotLocked: {
    backgroundColor: '#FEF3C7',
  },
  // Locked by the current user — richer amber with a border cue
  slotLockedOwn: {
    backgroundColor: '#FDE68A',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
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
  slotTextBlocked: {
    color: '#9CA3AF',
  },
  statusLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Locked by another user — amber label
  statusLabelLocked: {
    color: '#B45309',
  },
  // Locked by current user — warm amber
  statusLabelOwnLock: {
    color: '#92400E',
  },
  // Blocked — light text on very dark background
  statusLabelBlocked: {
    color: '#9CA3AF',
  },
});
