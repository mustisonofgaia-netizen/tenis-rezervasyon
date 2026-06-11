import type { CourtConfig, CourtId } from '../types/booking';

// ─── Club ─────────────────────────────────────────────────────────────────────

export type Club = {
  id: string;
  name: string;
  address: string;
  /** Full-resolution Unsplash image used as the hero card background */
  imageUrl: string;
  facilities: string[];
};

// ─── Court (enriched with club ownership) ────────────────────────────────────

export type ClubCourt = CourtConfig & { clubId: string };

// ─── Static data ─────────────────────────────────────────────────────────────

export const CLUBS: Club[] = [
  {
    id: 'club_1',
    name: 'Midas Tenis Kulübü',
    address: 'Ataşehir, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1562552476-4d7872d1e40c?w=800&q=80',
    facilities: ['Otopark', 'Duş', 'Kafeterya'],
  },
  {
    id: 'club_2',
    name: 'Bosphorus Padel Center',
    address: 'Beşiktaş, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1626088004984-c748428d80b9?w=800&q=80',
    facilities: ['Otopark', 'Duş', 'Pro Shop'],
  },
];

export const COURTS: ClubCourt[] = [
  {
    id: 'court_1',
    name: 'Merkez Kort',
    surface: 'Toprak',
    courtType: 'Kapalı',
    basePrice: 600,
    clubId: 'club_1',
  },
  {
    id: 'court_2',
    name: 'Açık Kort',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 500,
    clubId: 'club_1',
  },
  {
    id: 'court_3',
    name: 'Padel Kort',
    surface: 'Kristal',
    courtType: 'Kapalı',
    basePrice: 650,
    clubId: 'club_2',
  },
];

export const DEFAULT_COURT_ID: CourtId = COURTS[0].id;
export const COURT_IDS: CourtId[] = COURTS.map((c) => c.id);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the `Club` for a given `clubId`. Falls back to the first club. */
export function getClubById(id: string): Club {
  return CLUBS.find((c) => c.id === id) ?? CLUBS[0];
}

/** Returns the `ClubCourt` for a given `courtId`. Falls back to the first court. */
export function getCourtById(id: string): ClubCourt {
  return COURTS.find((c) => c.id === id) ?? COURTS[0];
}

/** Returns all courts that belong to a given `clubId`. */
export function getCourtsByClubId(clubId: string): ClubCourt[] {
  return COURTS.filter((c) => c.clubId === clubId);
}

/**
 * Returns a combined display label:
 * `"<ClubName> · <CourtName>"` — globally unique across all clubs.
 */
export function resolveFullCourtLabel(courtId: string): string {
  const court = getCourtById(courtId);
  const club  = getClubById(court.clubId);
  return `${club.name} · ${court.name}`;
}
