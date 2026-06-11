import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { MyBookingsScreen } from './src/screens/MyBookingsScreen';
import { TAB_BAR_HEIGHT } from './src/config/app';

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

// ─── Navigators ───────────────────────────────────────────────────────────────

const PlayerTab = createBottomTabNavigator<RootTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

const SHARED_TAB_SCREEN_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: '#22C55E',
  tabBarInactiveTintColor: '#9CA3AF',
  tabBarStyle: {
    height: TAB_BAR_HEIGHT,
    paddingBottom: 20,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
} as const;

function PlayerNavigator() {
  return (
    <PlayerTab.Navigator
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={SHARED_TAB_SCREEN_OPTIONS}
    >
      <PlayerTab.Screen
        name="Booking"
        component={BookingScreen}
        options={{ title: 'Kort Rezervasyonu' }}
      />
      <PlayerTab.Screen
        name="MyBookings"
        component={MyBookingsScreen}
        options={{ title: 'Rezervasyonlarım' }}
      />
    </PlayerTab.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminTab.Navigator
      // No tab bar for admin — full-canvas dashboard
      tabBar={() => null}
      screenOptions={{ headerShown: false }}
    >
      <AdminTab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
      />
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
      style={[
        styles.fab,
        isAdmin && styles.fabAdmin,
        { top: insets.top + 8 },
      ]}
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
      // Permission denied or unavailable — notifications are opt-in, safe to ignore
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
