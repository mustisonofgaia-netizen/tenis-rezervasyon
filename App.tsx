import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BookingScreen } from './src/screens/BookingScreen';
import { MyBookingsScreen } from './src/screens/MyBookingsScreen';
import { TAB_BAR_HEIGHT } from './src/config/app';

export type RootTabParamList = {
  Booking: undefined;
  MyBookings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          safeAreaInsets={{ bottom: 0 }}
          screenOptions={{
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
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
            },
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: '600',
            },
          }}
        >
          <Tab.Screen
            name="Booking"
            component={BookingScreen}
            options={{ title: 'Kort Rezervasyonu' }}
          />
          <Tab.Screen
            name="MyBookings"
            component={MyBookingsScreen}
            options={{ title: 'Rezervasyonlarım' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
