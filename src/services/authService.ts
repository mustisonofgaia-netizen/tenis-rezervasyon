import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from './firebase';

// ─── Mock social sign-in stubs ────────────────────────────────────────────────

type MockSocialProvider = 'apple' | 'google';

/**
 * Creates or signs in a mock social user via email/password under the hood.
 * Returns mock success immediately — replace with real OAuth when ready.
 */
async function signInWithMockProvider(provider: MockSocialProvider): Promise<void> {
  const email = `${provider}.${Date.now()}@kortum.mock`;
  const password = 'MockSocialPass123!';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', user.uid), {
      email,
      role: 'player',
      isVerified: false,
      createdAt: serverTimestamp(),
    });
  }
}

/** Mock Apple Sign-In — frictionless entry stub. */
export async function signInWithApple(): Promise<void> {
  await signInWithMockProvider('apple');
}

/** Mock Google Sign-In — frictionless entry stub. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithMockProvider('google');
}
