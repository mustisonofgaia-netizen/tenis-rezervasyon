import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPhoneNumber,
  type ApplicationVerifier,
  type ConfirmationResult,
} from 'firebase/auth';

import { auth } from './firebase';

// ─── Google Sign-In config ────────────────────────────────────────────────────
// Paste your Firebase Console keys before EAS Build:
// Authentication → Sign-in method → Google → Web client ID
// iOS client ID from GoogleService-Info.plist or Firebase project settings
GoogleSignin.configure({
  webClientId: '208140638479-o456u2defq3c7kbigj6biiqmh9aaagbf.apps.googleusercontent.com',
  iosClientId: '208140638479-6spjioctem1rhi3k6d1eqah3lbkpbejn.apps.googleusercontent.com',
});

const CANCEL_MESSAGE = 'Giriş iptal edildi';

function isAppleSignInCancelled(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code: string }).code === 'ERR_REQUEST_CANCELED'
  );
}

/** Sign in with Apple via Firebase OAuth credential. */
export async function signInWithApple(): Promise<void> {
  try {
    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const identityToken = appleCredential.identityToken;
    if (!identityToken) {
      throw new Error('Apple kimlik doğrulama jetonu alınamadı.');
    }

    const firebaseCredential = new OAuthProvider('apple.com').credential({
      idToken: identityToken,
    });

    await signInWithCredential(auth, firebaseCredential);
  } catch (error) {
    if (isAppleSignInCancelled(error)) {
      throw new Error(CANCEL_MESSAGE);
    }
    throw error;
  }
}

/** Sign in with Google via Firebase OAuth credential. */
export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const signInResult = await GoogleSignin.signIn();
  if (signInResult.type === 'cancelled') {
    throw new Error(CANCEL_MESSAGE);
  }

  const userInfo = signInResult.data;
  let idToken = userInfo.idToken;

  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    idToken = tokens.idToken;
  }

  if (!idToken) {
    throw new Error('Google kimlik doğrulama jetonu alınamadı.');
  }

  const firebaseCredential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(auth, firebaseCredential);
}

/**
 * Sends an SMS verification code via Firebase Phone Auth.
 * Pass a reCAPTCHA / Play Integrity verifier from the UI layer.
 */
export async function sendSmsVerification(
  phoneNumber: string,
  appVerifier: ApplicationVerifier,
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneNumber, appVerifier);
}
