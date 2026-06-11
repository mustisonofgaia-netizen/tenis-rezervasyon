// ─── Explore stack ────────────────────────────────────────────────────────────

export type ExploreStackParamList = {
  /** Club discovery feed */
  ExploreHome: undefined;
  /** Court booking flow — requires the selected club's ID */
  BookingScreen: { clubId: string };
};

// ─── Root tab navigator ───────────────────────────────────────────────────────

export type RootTabParamList = {
  /** First tab — houses the ExploreNavigator (stack) */
  Booking: undefined;
  MyBookings: undefined;
  Matches: undefined;
  Profile: undefined;
};
