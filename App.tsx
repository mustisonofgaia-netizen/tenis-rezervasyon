import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { MyBookingsScreen } from './src/screens/MyBookingsScreen';

// ─── Navigation types ─────────────────────────────────────────────────────────

export type RootTabParamList = {
  Booking: undefined;
  MyBookings: undefined;
};

export type AdminTabParamList = {
  AdminDashboard: undefined;
};

// ─── Notification setup (module-level) ───────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Custom floating tab bar ──────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICON: Record<string, IoniconName> = {
  Booking: 'calendar-outline',
  MyBookings: 'bookmark-outline',
};

const TAB_LABEL: Record<string, string> = {
  Booking: 'Rezervasyon',
  MyBookings: 'Rezervasyonlarım',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.customTabBarContainer}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tint = isFocused ? '#22C55E' : '#94A3B8';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.customTabItem}
            activeOpacity={0.7}
          >
            <Ionicons
              name={TAB_ICON[route.name] ?? 'ellipse-outline'}
              size={24}
              color={tint}
              style={styles.customTabIcon}
            />
            <Text style={[styles.customTabLabel, { color: tint }]}>
              {TAB_LABEL[route.name] ?? route.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Navigators ───────────────────────────────────────────────────────────────

const PlayerTab = createBottomTabNavigator<RootTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

function PlayerNavigator() {
  return (
    <PlayerTab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <PlayerTab.Screen name="Booking" component={BookingScreen} />
      <PlayerTab.Screen name="MyBookings" component={MyBookingsScreen} />
    </PlayerTab.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminTab.Navigator
      tabBar={() => null}
      screenOptions={{ headerShown: false }}
    >
      <AdminTab.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </AdminTab.Navigator>
  );
}

// ─── Role toggle FAB ─────────────────────────────────────────────────────────

type RoleToggleFABProps = {
  isAdmin: boolean;
  onToggle: () => void;
};

function RoleToggleFAB({ isAdmin, onToggle }: RoleToggleFABProps) {
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggle}
      style={[styles.fab, isAdmin && styles.fabAdmin, { top: insets.top + 8 }]}
    >
      <Text style={styles.fabText}>
        {isAdmin ? '⚙️  Yönetici' : '🎾  Oyuncu'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {
      // Permission denied or unavailable — opt-in, safe to ignore
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          {isAdminMode ? <AdminNavigator /> : <PlayerNavigator />}
        </NavigationContainer>

        {/* Floats above the navigator on all screens */}
        <RoleToggleFAB
          isAdmin={isAdminMode}
          onToggle={() => setIsAdminMode((v) => !v)}
        />

        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Floating pill tab bar ──────────────────────────────────────────────────
  // Lives outside the navigator's layout engine so nothing can clip it.
  customTabBarContainer: {
    position: 'absolute',
    bottom: 34,
    left: 24,
    right: 24,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  customTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTabIcon: {
    marginBottom: 2,
  },
  customTabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Role toggle FAB ────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#22C55E',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  fabAdmin: {
    backgroundColor: '#1D4ED8',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
