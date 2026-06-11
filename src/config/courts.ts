/**
 * Thin re-export facade.
 * All existing imports (`COURTS`, `COURT_IDS`, `DEFAULT_COURT_ID`, `getCourtById`)
 * continue to work unchanged; `data.ts` is now the single source of truth.
 */
export {
  COURTS,
  COURT_IDS,
  DEFAULT_COURT_ID,
  getCourtById,
} from './data';
