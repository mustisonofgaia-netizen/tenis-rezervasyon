import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { SlotInfo } from '../types/booking';

type TimeSlotGridProps = {
  slots: SlotInfo[];
  selectedSlot: string | null;
  onSelectSlot: (slot: string) => void;
  /** uid of the current authenticated user — enables own-lock detection */
  currentUserId?: string;
};

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

export function TimeSlotGrid({
  slots,
  selectedSlot,
  onSelectSlot,
  currentUserId,
}: TimeSlotGridProps) {
  const handlePress = (slot: SlotInfo) => {
    if (!isSelectable(slot, currentUserId)) return;
    onSelectSlot(slot.time);
  };

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot.time;
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
              isSelected
                ? styles.slotSelected
                : [
                    slot.status === 'LOCKED' && (isOwnLock ? styles.slotLockedOwn : styles.slotLocked),
                    slot.status === 'CONFIRMED' && styles.slotBooked,
                    slot.status === 'BLOCKED' && styles.slotBlocked,
                  ],
            ]}
          >
            <Text
              style={[
                styles.slotText,
                isSelected && styles.slotTextSelected,
                !isSelected && !selectable && !isOwnLock && styles.slotTextDisabled,
                !isSelected && slot.status === 'BLOCKED' && styles.slotTextBlocked,
              ]}
            >
              {slot.time}
            </Text>
            {statusLabel ? (
              <Text
                style={[
                  styles.statusLabel,
                  isSelected && styles.statusLabelSelected,
                  !isSelected && slot.status === 'LOCKED' && styles.statusLabelLocked,
                  !isSelected && isOwnLock && styles.statusLabelOwnLock,
                  !isSelected && slot.status === 'BLOCKED' && styles.statusLabelBlocked,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotSelected: {
    backgroundColor: '#22C55E',
    borderColor: '#16A34A',
  },
  slotLocked: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  slotLockedOwn: {
    backgroundColor: '#FDE68A',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  slotBooked: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.75,
  },
  slotBlocked: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
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
  statusLabelSelected: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  statusLabelLocked: {
    color: '#B45309',
  },
  statusLabelOwnLock: {
    color: '#92400E',
  },
  statusLabelBlocked: {
    color: '#9CA3AF',
  },
});
