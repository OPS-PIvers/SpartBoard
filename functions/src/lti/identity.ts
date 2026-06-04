// Schoology LTI 1.3 — student pseudonym derivation.
//
// One canonical helper, imported by BOTH the launch endpoint (which mints the
// studentRole custom token under this uid) AND the NRPS name resolver (which
// must compute the SAME uid from a membership entry to map it back to a
// response doc). Keeping it in one place guarantees the write-side and the
// read-side never drift — if they did, the resolver would map names to uids
// that match nothing and every Schoology student would silently fall back to
// "Student".

import * as CryptoJS from 'crypto-js';

/**
 * Stable Firebase uid for a Schoology user, namespaced off their LTI `sub`.
 * The `sub` is the platform's stable per-user id — it is the SAME value the
 * launch id_token carries and that NRPS returns as `user_id`, so a name
 * resolved from NRPS maps deterministically onto the response doc keyed by
 * this uid. PII-free: the input is an opaque platform id, never a name/email.
 */
export function ltiStudentUid(sub: string, hmacSecret: string): string {
  return CryptoJS.HmacSHA256(`schoology-sub:${sub}`, hmacSecret).toString(
    CryptoJS.enc.Hex
  );
}
