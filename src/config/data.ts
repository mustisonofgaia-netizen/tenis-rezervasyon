import type { CourtConfig, CourtId } from '../types/booking';

// ─── Club ─────────────────────────────────────────────────────────────────────

export type Club = {
  id: string;
  name: string;
  address: string;
  /** Full-resolution Unsplash image used as the hero card background */
  imageUrl: string;
  facilities: string[];
  /** Surface / court-type tags — drives ExploreScreen filter pills */
  surfaces: string[];
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
    surfaces: ['Toprak Kort', 'Kapalı Kort'],
  },
  {
    id: 'club_2',
    name: 'Bosphorus Padel Center',
    address: 'Beşiktaş, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1626088004984-c748428d80b9?w=800&q=80',
    facilities: ['Otopark', 'Duş', 'Pro Shop'],
    surfaces: ['Sert Zemin', 'Kapalı Kort'],
  },
  {
    id: 'club_3',
    name: 'Fenerbahçe Tenis Akademisi',
    address: 'Kadıköy, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&q=80',
    facilities: ['Otopark', 'Restoran', 'Fitness'],
    surfaces: ['Toprak Kort', 'Açık Kort'],
  },
  {
    id: 'club_4',
    name: 'Sarıyer Tenis Akademisi',
    address: 'Sarıyer, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80',
    facilities: ['Otopark', 'Kafeterya', 'Soyunma Odası'],
    surfaces: ['Sert Zemin', 'Açık Kort'],
  },
  {
    id: 'club_5',
    name: 'Beylikdüzü Spor Kompleksi',
    address: 'Beylikdüzü, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&q=80',
    facilities: ['Otopark', 'Havuz', 'Kafeterya'],
    surfaces: ['Toprak Kort', 'Sert Zemin', 'Kapalı Kort'],
  },
  {
    id: 'club_6',
    name: 'Bakırköy Tenis Merkezi',
    address: 'Bakırköy, İstanbul',
    imageUrl:
      'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80',
    facilities: ['Otopark', 'Duş', 'Pro Shop'],
    surfaces: ['Açık Kort', 'Sert Zemin'],
  },
];

export const COURTS: ClubCourt[] = [
  // club_1
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
  // club_2
  {
    id: 'court_3',
    name: 'Padel Kort',
    surface: 'Kristal',
    courtType: 'Kapalı',
    basePrice: 650,
    clubId: 'club_2',
  },
  // club_3
  {
    id: 'court_4',
    name: 'Ana Kort',
    surface: 'Toprak',
    courtType: 'Açık',
    basePrice: 550,
    clubId: 'club_3',
  },
  {
    id: 'court_5',
    name: 'Yardımcı Kort',
    surface: 'Toprak',
    courtType: 'Açık',
    basePrice: 480,
    clubId: 'club_3',
  },
  // club_4
  {
    id: 'court_6',
    name: 'Hızlı Zemin Kort',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 520,
    clubId: 'club_4',
  },
  // club_5
  {
    id: 'court_7',
    name: 'Kapalı Kort A',
    surface: 'Toprak',
    courtType: 'Kapalı',
    basePrice: 700,
    clubId: 'club_5',
  },
  {
    id: 'court_8',
    name: 'Kapalı Kort B',
    surface: 'Akrilik',
    courtType: 'Kapalı',
    basePrice: 680,
    clubId: 'club_5',
  },
  {
    id: 'court_9',
    name: 'Açık Kort',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 450,
    clubId: 'club_5',
  },
  // club_6
  {
    id: 'court_10',
    name: 'Kuzey Kort',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 490,
    clubId: 'club_6',
  },
  {
    id: 'court_11',
    name: 'Güney Kort',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 490,
    clubId: 'club_6',
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
