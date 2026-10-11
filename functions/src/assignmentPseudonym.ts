import * as CryptoJS from 'crypto-js';

/** Per-assignment student pseudonym: HMAC_SHA256(secret, "asn:" + uid + ":" + assignmentId). */
export function computeAssignmentPseudonym(
  uid: string,
  assignmentId: string,
  hmacSecret: string
): string {
  return CryptoJS.HmacSHA256(`asn:${uid}:${assignmentId}`, hmacSecret).toString(
    CryptoJS.enc.Hex
  );
}
