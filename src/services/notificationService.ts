import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from './firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPO_PUSH_API    = 'https://exp.host/--/api/v2/push/send';
const USERS_COLLECTION = 'users';

// ─── Token Registration ───────────────────────────────────────────────────────

/**
 * Requests permission and registers the device for Expo push notifications.
 * Persists the Expo push token to `users/{userId}.expoPushToken` in Firestore.
 *
 * Returns `null` on simulators/emulators, after permission denial, or when no
 * EAS `projectId` is configured. Never throws — all failures are logged only.
 *
 * To enable tokens, add your Expo project ID to `app.json`:
 *   "extra": { "eas": { "projectId": "<your-project-id>" } }
 */
export async function registerForPushNotificationsAsync(
  userId: string,
): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[notifications] Skipping token registration — not a physical device.');
    return null;
  }

  // Android 13+ needs a channel to exist before requesting the push token
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:             'Genel Bildirimler',
      importance:       Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#22C55E',
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    console.log('[notifications] Permission denied — push token unavailable.');
    return null;
  }

  // Resolve the Expo project ID from EAS config (set automatically by EAS Build,
  // or manually via app.json "extra.eas.projectId")
  const projectId =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.eas?.['projectId'] as string | undefined
    ?? Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn(
      '[notifications] No EAS projectId found in app.json "extra.eas.projectId". ' +
      'Token registration skipped — add the projectId to enable push notifications.',
    );
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // Persist token so other users can target this device
    await setDoc(doc(db, USERS_COLLECTION, userId), { expoPushToken: token }, { merge: true });
    console.log(`[notifications] Token registered: ${token}`);
    return token;
  } catch (err) {
    console.error('[notifications] Token fetch/save failed:', err);
    return null;
  }
}

// ─── Push Delivery ────────────────────────────────────────────────────────────

/**
 * Looks up the target user's stored Expo push token and delivers a notification
 * via Expo's Push API.
 *
 * Fully fire-and-forget — failures are only logged, never thrown.
 * This keeps notification logic from blocking or breaking critical app paths.
 */
export async function sendPushNotification(
  targetUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const snap  = await getDoc(doc(db, USERS_COLLECTION, targetUserId));
    const token = snap.data()?.expoPushToken as string | undefined;

    if (!token) return; // User hasn't granted notification permissions yet

    await fetch(EXPO_PUSH_API, {
      method:  'POST',
      headers: {
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to:    token,
        title,
        body,
        data:  data ?? {},
        sound: 'default',
      }),
    });
  } catch (err) {
    // Non-fatal: notification failures must never break the calling flow
    console.warn('[notifications] Push delivery failed:', err);
  }
}
