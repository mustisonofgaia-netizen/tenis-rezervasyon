import type { CourtConfig, CourtId } from '../types/booking';

export const COURTS: CourtConfig[] = [
  {
    id: 'court_1',
    name: 'Merkez Kort',
    surface: 'Toprak',
    courtType: 'Kapalı',
    basePrice: 600,
  },
  {
    id: 'court_2',
    name: 'Açık Kort A',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 500,
  },
  {
    id: 'court_3',
    name: 'Açık Kort B',
    surface: 'Akrilik',
    courtType: 'Açık',
    basePrice: 500,
  },
];

export const DEFAULT_COURT_ID: CourtId = 'court_1';

export const COURT_IDS: CourtId[] = COURTS.map((c) => c.id);

export function getCourtById(id: CourtId): CourtConfig {
  return COURTS.find((c) => c.id === id)!;
}
