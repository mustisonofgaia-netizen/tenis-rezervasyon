import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { ThemeProvider } from './src/context/ThemeContext';
import * as Haptics from 'expo-haptics';
import { registerForPushNotificationsAsync } from './src/services/notificationService';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { ExploreScreen } from './src/screens/ExploreScreen';
import { MatchesScreen } from './src/screens/MatchesScreen';
import { MyBookingsScreen } from './src/screens/MyBookingsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TournamentScreen } from './src/screens/TournamentScreen';
import { CreateTournamentScreen } from './src/screens/CreateTournamentScreen';
import { OrganizerDashboardScreen } from './src/screens/OrganizerDashboardScreen';
import { auth, db } from './src/services/firebase';
import type { AdminRole } from './src/types/user';
import type {
  ExploreStackParamList,
  RootTabParamList,
  TournamentStackParamList,
} from './src/navigation/types';

export type { RootTabParamList, ExploreStackParamList };

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
  | { phase: 'ready'; uid: string; role: AdminRole; managedClubId: string };

// ─── Custom floating tab bar ──────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICON: Record<string, IoniconName> = {
  Booking:    'compass-outline',
  MyBookings: 'bookmark-outline',
  Matches:    'people-outline',
  Tournament: 'trophy-outline',
  Profile:    'person-outline',
};

const TAB_LABEL: Record<string, string> = {
  Booking:    'Keşfet',
  MyBookings: 'Etkinlik',
  Matches:    'Lobi',
  Tournament: 'Turnuvalar',
  Profile:    'Profil',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const tint = isFocused ? '#22C55E' : '#94A3B8';

        const onPress = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

// ─── Explore stack (Club discovery → Court booking) ───────────────────────────

const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();

function ExploreNavigator() {
  return (
    <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
      <ExploreStack.Screen name="ExploreHome" component={ExploreScreen} />
      <ExploreStack.Screen name="BookingScreen" component={BookingScreen} />
    </ExploreStack.Navigator>
  );
}

// ─── Tournament stack (Hub → Organizer panel) ─────────────────────────────────

const TournamentStack = createNativeStackNavigator<TournamentStackParamList>();

function TournamentNavigator() {
  return (
    <TournamentStack.Navigator screenOptions={{ headerShown: false }}>
      <TournamentStack.Screen name="TournamentHome"      component={TournamentScreen} />
      <TournamentStack.Screen name="CreateTournament"    component={CreateTournamentScreen} />
      <TournamentStack.Screen name="OrganizerDashboard"  component={OrganizerDashboardScreen} />
    </TournamentStack.Navigator>
  );
}

// ─── Root tab navigator ───────────────────────────────────────────────────────

const PlayerTab = createBottomTabNavigator<RootTabParamList>();
const AdminTab  = createBottomTabNavigator<AdminTabParamList>();

function PlayerNavigator() {
  return (
    <PlayerTab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <PlayerTab.Screen name="Booking"    component={ExploreNavigator} />
      <PlayerTab.Screen name="MyBookings" component={MyBookingsScreen} />
      <PlayerTab.Screen name="Matches"    component={MatchesScreen} />
      <PlayerTab.Screen name="Tournament" component={TournamentNavigator} />
      <PlayerTab.Screen name="Profile"    component={ProfileScreen} />
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
    const authUnsub = onAuthStateChanged(auth, (user) => {
      // Always tear down any previous user-doc listener first
      userUnsubRef.current?.();
      userUnsubRef.current = null;

      if (!user) {
        setAuthState({ phase: 'unauthenticated' });
        return;
      }

      // Register for push notifications on every sign-in (non-blocking)
      registerForPushNotificationsAsync(user.uid).catch(() => {});

      // User is signed in — show spinner while we fetch the role
      setAuthState({ phase: 'loading' });

      userUnsubRef.current = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const rawRole = snap.data()?.role as string | undefined;
          // Normalise legacy 'ADMIN'/'CUSTOMER' values → canonical AdminRole
          const role: AdminRole =
            rawRole === 'super_admin' ? 'super_admin'
            : rawRole === 'club_admin' ? 'club_admin'
            : rawRole === 'ADMIN'     ? 'super_admin'
            : 'player';
          const managedClubId =
            (snap.data()?.managedClubId as string | undefined) ?? '';
          setAuthState({ phase: 'ready', uid: user.uid, role, managedClubId });
        },
        () => {
          // Firestore read error → grant player access rather than blocking
          setAuthState({ phase: 'ready', uid: user.uid, role: 'player', managedClubId: '' });
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
    if (authState.phase === 'unauthenticated') return <LoginScreen />;

    return (
      <AuthProvider
        uid={authState.uid}
        role={authState.role}
        managedClubId={authState.managedClubId}
      >
        <NavigationContainer>
          {authState.role === 'club_admin' || authState.role === 'super_admin' ? (
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
        <ThemeProvider>
          {renderContent()}
          <StatusBar style="auto" />
        </ThemeProvider>
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
