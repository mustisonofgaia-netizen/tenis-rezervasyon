import type { NavigatorScreenParams } from '@react-navigation/native';

// ─── Explore stack ────────────────────────────────────────────────────────────

export type ExploreStackParamList = {
  /** Club discovery feed */
  ExploreHome: undefined;
  /** Court booking flow — requires the selected club's ID */
  BookingScreen: { clubId: string };
};

// ─── Tournament stack ─────────────────────────────────────────────────────────

export type TournamentStackParamList = {
  /** Main tournament hub with Lig / Defi / Özel tabs */
  TournamentHome:      undefined;
  /** Organizer-only screen for creating a new tournament */
  CreateTournament:    undefined;
  /** Organizer dashboard — pending registrations and match approvals */
  OrganizerDashboard:  undefined;
};

// ─── Root tab navigator ───────────────────────────────────────────────────────

export type RootTabParamList = {
  /** First tab — houses the ExploreNavigator (stack) */
  Booking:    undefined;
  MyBookings: undefined;
  Matches:    undefined;
  /**
   * Tournament tab hosts the TournamentNavigator (native stack).
   * Typed as NavigatorScreenParams so cross-tab deep-linking is fully typed.
   */
  Tournament: NavigatorScreenParams<TournamentStackParamList> | undefined;
  Profile:    undefined;
};
