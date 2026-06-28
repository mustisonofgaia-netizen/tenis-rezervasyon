/**
 * @file src/hooks/useTournaments.ts
 *
 * Centralised data-fetching, state management, and polling for the Tournament
 * Hub.  Strictly decoupled from navigation — the screen layer owns all routing.
 *
 * Architecture decisions
 * ─────────────────────
 * • "Explore" feed (public)  — one-shot fetch on mount + 30-second background
 *   poll.  Real-time Firestore listeners for a global public feed would cost
 *   O(concurrent_users) persistent connections; polling is far cheaper at scale.
 *
 * • "My Tournaments" feed    — real-time `onSnapshot` listener so newly created
 *   tournaments appear instantly without any manual refresh.
 *
 * • `refreshExplore`         — public imperative escape-hatch for pull-to-refresh
 *   and `useFocusEffect` in the screen.
 *
 * Migration note
 * ──────────────
 * The shape of the returned object is intentionally compatible with TanStack
 * Query's `useQuery` / `useInfiniteQuery` return values.  Swapping the
 * internals in a future phase requires only changing this file.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  fetchActiveTournaments,
  subscribeToMyTournaments,
} from '../services/tournamentService';
import type { Tournament } from '../types/tournament';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Background poll interval for the public Explore feed (ms). */
const EXPLORE_POLL_MS = 30_000;

// ─── Internal fetch modes ─────────────────────────────────────────────────────

type FetchMode =
  | 'initial'   // First load — show full-screen spinner
  | 'refresh'   // Pull-to-refresh — show RefreshControl spinner
  | 'poll';     // Background poll — silent, no spinner

// ─── Public contract ──────────────────────────────────────────────────────────

export type UseTournamentsReturn = {
  /** Public tournaments for the Explore tab. */
  exploreTournaments: Tournament[];
  /** Tournaments owned by the signed-in user (real-time). */
  myTournaments: Tournament[];
  /** True during the initial Explore fetch (full-screen spinner). */
  isLoadingExplore: boolean;
  /** True while the real-time My subscription is being established. */
  isLoadingMy: boolean;
  /**
   * True while a pull-to-refresh is in flight.
   * Pass to `<RefreshControl refreshing={isRefreshingExplore} …>`.
   */
  isRefreshingExplore: boolean;
  /**
   * Trigger an explicit refresh of the Explore feed (e.g. pull-to-refresh,
   * `useFocusEffect`).  Sets `isRefreshingExplore = true` during the fetch.
   */
  refreshExplore: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTournaments(uid: string | null): UseTournamentsReturn {

  // ── State ──────────────────────────────────────────────────────────────────

  const [exploreTournaments,  setExploreTournaments]  = useState<Tournament[]>([]);
  const [myTournaments,       setMyTournaments]       = useState<Tournament[]>([]);
  const [isLoadingExplore,    setIsLoadingExplore]    = useState(true);
  // Optimistically start in loading state when uid is known at hook init time,
  // avoiding a brief empty-list flash before the snapshot fires.
  const [isLoadingMy,         setIsLoadingMy]         = useState(!!uid);
  const [isRefreshingExplore, setIsRefreshingExplore] = useState(false);

  // ── Explore fetch (stable — only references stable state setters + module import) ─

  const loadExplore = useCallback(async (mode: FetchMode) => {
    if (mode === 'initial') setIsLoadingExplore(true);
    if (mode === 'refresh') setIsRefreshingExplore(true);

    try {
      const data = await fetchActiveTournaments('public');
      setExploreTournaments(data);
    } catch (err) {
      // Surface errors for initial/refresh; suppress for silent background polls
      if (mode !== 'poll') {
        console.error('[useTournaments] loadExplore:', err);
      }
    } finally {
      if (mode === 'initial') setIsLoadingExplore(false);
      if (mode === 'refresh') setIsRefreshingExplore(false);
    }
  }, []); // stable — no external reactive deps

  // ── Initial fetch on mount ─────────────────────────────────────────────────

  useEffect(() => {
    loadExplore('initial');
  }, [loadExplore]);

  // ── Background polling every 30 s ─────────────────────────────────────────
  // Uses silent mode so there's no loading indicator for passive updates.
  // `loadExplore` is stable (empty deps) so the interval is only set up once.

  useEffect(() => {
    const id = setInterval(() => { loadExplore('poll'); }, EXPLORE_POLL_MS);
    return () => clearInterval(id);
  }, [loadExplore]);

  // ── Public refresh (for pull-to-refresh and useFocusEffect) ───────────────

  const refreshExplore = useCallback(() => { loadExplore('refresh'); }, [loadExplore]);

  // ── Real-time "My Tournaments" subscription ───────────────────────────────

  useEffect(() => {
    if (!uid) {
      setMyTournaments([]);
      setIsLoadingMy(false);
      return;
    }

    setIsLoadingMy(true);

    const unsubscribe = subscribeToMyTournaments(uid, (data) => {
      setMyTournaments(data);
      setIsLoadingMy(false);
    });

    return unsubscribe;
  }, [uid]);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    exploreTournaments,
    myTournaments,
    isLoadingExplore,
    isLoadingMy,
    isRefreshingExplore,
    refreshExplore,
  };
}
