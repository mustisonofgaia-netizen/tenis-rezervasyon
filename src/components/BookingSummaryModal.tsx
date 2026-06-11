import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const DISMISS_THRESHOLD = 100;
const DEFAULT_SHEET_OFFSET = 400;

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 220,
  useNativeDriver: true,
} as const;

type BookingSummaryModalProps = {
  isVisible: boolean;
  onClose: () => void;
  date: string;
  time: string;
  onConfirm: () => void;
  courtName: string;
  price: number;
};

function formatBookingDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type DetailRowProps = {
  iconLabel: string;
  label: string;
  value: string;
};

function DetailRow({ iconLabel, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Text style={styles.detailIconText}>{iconLabel}</Text>
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export function BookingSummaryModal({
  isVisible,
  onClose,
  date,
  time,
  onConfirm,
  courtName,
  price,
}: BookingSummaryModalProps) {
  const formattedDate = formatBookingDate(date);
  const sheetTranslateY = useRef(new Animated.Value(DEFAULT_SHEET_OFFSET)).current;
  const sheetHeight = useRef(DEFAULT_SHEET_OFFSET);

  const animateSheetOpen = useCallback(() => {
    sheetTranslateY.setValue(sheetHeight.current);
    Animated.spring(sheetTranslateY, {
      ...SPRING_CONFIG,
      toValue: 0,
    }).start();
  }, [sheetTranslateY]);

  const animateSheetClosed = useCallback(
    (callback?: () => void) => {
      Animated.timing(sheetTranslateY, {
        toValue: sheetHeight.current,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          sheetTranslateY.setValue(sheetHeight.current);
          callback?.();
        }
      });
    },
    [sheetTranslateY],
  );

  const handleDismiss = useCallback(() => {
    animateSheetClosed(onClose);
  }, [animateSheetClosed, onClose]);

  useEffect(() => {
    if (isVisible) {
      animateSheetOpen();
    }
  }, [isVisible, animateSheetOpen]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetTranslateY.setOffset(value);
            sheetTranslateY.setValue(0);
          });
        },
        onPanResponderMove: (_, gestureState) => {
          sheetTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
          sheetTranslateY.flattenOffset();

          if (
            gestureState.dy > DISMISS_THRESHOLD ||
            gestureState.vy > 0.75
          ) {
            animateSheetClosed(onClose);
            return;
          }

          Animated.spring(sheetTranslateY, {
            ...SPRING_CONFIG,
            toValue: 0,
          }).start();
        },
      }),
    [animateSheetClosed, onClose, sheetTranslateY],
  );

  const handleSheetLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      sheetHeight.current = event.nativeEvent.layout.height;
    },
    [],
  );

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleDismiss} />

        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          onLayout={handleSheetLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Rezervasyon Özeti</Text>
          <View style={styles.divider} />

          <Text style={styles.facilityName}>{courtName}</Text>

          <View style={styles.detailsSection}>
            <DetailRow iconLabel="T" label="Tarih" value={formattedDate} />
            <DetailRow iconLabel="S" label="Saat" value={time} />
          </View>

          <View style={styles.divider} />

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Kort Ücreti</Text>
            <Text style={styles.priceValue}>{price.toLocaleString('tr-TR')} TL</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onConfirm}
            style={styles.confirmButton}
          >
            <Text style={styles.confirmButtonText}>Ödemeye Geç</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  facilityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 24,
  },
  detailsSection: {
    marginTop: 20,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  detailIconText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22C55E',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
  },
  confirmButton: {
    marginTop: 24,
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
