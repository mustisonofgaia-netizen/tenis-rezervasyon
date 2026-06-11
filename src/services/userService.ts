import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserProfile = { initial: string; color: string };

// ─── Avatar colour palette ────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  '#22C55E', '#3B82F6', '#F97316',
  '#8B5CF6', '#EC4899', '#14B8A6',
];

/** Deterministic, uid-stable colour from the palette. */
export function avatarColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// ─── Module-level cache ───────────────────────────────────────────────────────
// Single instance shared by every component that imports this module.
// Survives re-renders and navigation; cleared only on full app reload.

export const profileCache = new Map<string, UserProfile>();

// ─── Profile resolver ─────────────────────────────────────────────────────────

/**
 * Returns the `UserProfile` for a given uid.
 * Reads `users/{uid}.email` from Firestore on first call; subsequent calls
 * are served from the in-memory cache without any network traffic.
 */
export async function resolveProfile(uid: string): Promise<UserProfile> {
  const cached = profileCache.get(uid);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const email = (snap.data()?.email as string | undefined) ?? uid;
    const profile: UserProfile = { initial: email[0].toUpperCase(), color: avatarColor(uid) };
    profileCache.set(uid, profile);
    return profile;
  } catch {
    const profile: UserProfile = {
      initial: (uid[0] ?? '?').toUpperCase(),
      color: avatarColor(uid),
    };
    profileCache.set(uid, profile);
    return profile;
  }
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/**
 * Resolves profiles for all `uids`, returning a `Record<uid, UserProfile>`.
 * Uses the cache for already-known profiles; fires Firestore reads only for
 * unknowns. Gracefully degrades — failures populate a fallback entry so
 * callers always receive a complete map.
 */
export async function resolveProfiles(
  uids: string[],
): Promise<Record<string, UserProfile>> {
  const uncached = uids.filter((id) => !profileCache.has(id));
  if (uncached.length > 0) {
    await Promise.all(uncached.map(resolveProfile)).catch(() => {});
  }

  const result: Record<string, UserProfile> = {};
  for (const id of uids) {
    const p = profileCache.get(id);
    if (p) result[id] = p;
  }
  return result;
}
