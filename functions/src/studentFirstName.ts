/** First name as the student sign-in page derives it from an ID token; 'Student' when absent or over 60 chars. */
export function studentFirstName(
  givenName: unknown,
  fullName: unknown
): string {
  const given = typeof givenName === 'string' ? givenName.trim() : '';
  const full = typeof fullName === 'string' ? fullName.trim() : '';
  const first = given || full.split(/\s+/)[0] || '';
  return first.length > 0 && first.length <= 60 ? first : 'Student';
}
