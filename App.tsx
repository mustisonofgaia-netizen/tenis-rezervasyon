import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { MatchesScreen } from './src/screens/MatchesScreen';
import { MyBookingsScreen } from './src/screens/MyBookingsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { auth, db } from './src/services/firebase';

// ─── Navigation types ─────────────────────────────────────────────────────────

export type RootTabParamList = {
  Booking: undefined;
  MyBookings: undefined;
  Matches: undefined;
  Profile: undefined;
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

// ─── Auth state machine ───────────────────────────────────────────────────────

type AuthState =
  | { phase: 'loading' }
  | { phase: 'unauthenticated' }
  | { phase: 'ready'; uid: string; role: 'ADMIN' | 'CUSTOMER' };

// ─── Custom floating tab bar ──────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICON: Record<string, IoniconName> = {
  Booking:   'calendar-outline',
  MyBookings: 'bookmark-outline',
  Matches:   'people-outline',
  Profile:   'person-outline',
};

const TAB_LABEL: Record<string, string> = {
  Booking:   'Rezerve',
  MyBookings: 'Etkinlik',
  Matches:   'Lobi',
  Profile:   'Profil',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
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
            style={styles.tabItem}
            activeOpacity={0.7}
          >
            <Ionicons
              name={TAB_ICON[route.name] ?? 'ellipse-outline'}
              size={24}
              color={tint}
              style={styles.tabIcon}
            />
            <Text style={[styles.tabLabel, { color: tint }]}>
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
      <PlayerTab.Screen name="Matches" component={MatchesScreen} />
      <PlayerTab.Screen name="Profile" component={ProfileScreen} />
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

// ─── Splash loader ────────────────────────────────────────────────────────────

function SplashLoader() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashLogoCircle}>
        <Text style={styles.splashEmoji}>🎾</Text>
      </View>
      <ActivityIndicator
        size="large"
        color="#22C55E"
        style={styles.splashSpinner}
      />
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ phase: 'loading' });
  // Ref holds the active Firestore user-doc unsubscribe so we can tear it
  // down immediately whenever the auth user changes or signs out.
  const userUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});

    const authUnsub = onAuthStateChanged(auth, (user) => {
      // Always tear down any previous user-doc listener first
      userUnsubRef.current?.();
      userUnsubRef.current = null;

      if (!user) {
        setAuthState({ phase: 'unauthenticated' });
        return;
      }

      // User is signed in — show spinner while we fetch the role
      setAuthState({ phase: 'loading' });

      userUnsubRef.current = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const role = snap.data()?.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER';
          setAuthState({ phase: 'ready', uid: user.uid, role });
        },
        () => {
          // Firestore read error → grant CUSTOMER access rather than blocking
          setAuthState({ phase: 'ready', uid: user.uid, role: 'CUSTOMER' });
        },
      );
    });

    return () => {
      authUnsub();
      userUnsubRef.current?.();
    };
  }, []);

  const renderContent = () => {
    if (authState.phase === 'loading') return <SplashLoader />;
    if (authState.phase === 'unauthenticated') return <AuthScreen />;

    return (
      <AuthProvider uid={authState.uid}>
        <NavigationContainer>
          {authState.role === 'ADMIN' ? (
            <AdminNavigator />
          ) : (
            <PlayerNavigator />
          )}
        </NavigationContainer>
      </AuthProvider>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {renderContent()}
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Splash ──────────────────────────────────────────────────────────────────
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  splashLogoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  splashEmoji: {
    fontSize: 36,
  },
  splashSpinner: {
    marginTop: 8,
  },

  // ── Floating pill tab bar ────────────────────────────────────────────────────
  tabBar: {
    position: 'absolute',
    bottom: 24,
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
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
