import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserProfile = {
  initial: string;
  color: string;
  /** Full name when first + last are stored; otherwise null. */
  displayName: string | null;
};

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

export const profileCache = new Map<string, UserProfile>();

export function invalidateProfileCache(uid: string): void {
  profileCache.delete(uid);
}

// ─── Profile builders ─────────────────────────────────────────────────────────

function buildProfile(uid: string, data: Record<string, unknown> | undefined): UserProfile {
  const firstName = ((data?.firstName as string | undefined) ?? '').trim();
  const lastName  = ((data?.lastName  as string | undefined) ?? '').trim();
  const email     = ((data?.email     as string | undefined) ?? '').trim();

  const displayName =
    firstName && lastName ? `${firstName} ${lastName}`
    : firstName || lastName || null;

  let initial: string;
  if (firstName && lastName) {
    initial = `${firstName[0]}${lastName[0]}`.toUpperCase();
  } else if (displayName) {
    initial = displayName[0]!.toUpperCase();
  } else if (email) {
    initial = email[0]!.toUpperCase();
  } else {
    initial = (uid[0] ?? '?').toUpperCase();
  }

  return { initial, color: avatarColor(uid), displayName };
}

/** Lobby-safe participant label — never exposes raw UID. */
export function getParticipantLabel(
  profile: UserProfile,
  playerUid: string,
  currentUid: string,
): string {
  if (playerUid === currentUid) return 'Sen';
  return profile.displayName ?? 'Oyuncu';
}

// ─── Profile resolver ─────────────────────────────────────────────────────────

export async function resolveProfile(uid: string): Promise<UserProfile> {
  const cached = profileCache.get(uid);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const profile = buildProfile(uid, snap.data());
    profileCache.set(uid, profile);
    return profile;
  } catch {
    const profile = buildProfile(uid, undefined);
    profileCache.set(uid, profile);
    return profile;
  }
}

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
