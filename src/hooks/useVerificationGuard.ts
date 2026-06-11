import { useAuth } from '../context/AuthContext';

/**
 * Progressive verification guard.
 * Intercepts high-value actions when the user has not completed SMS/name verification.
 */
export function useVerificationGuard() {
  const { requireVerification, profile } = useAuth();
  return { requireVerification, profile };
}
