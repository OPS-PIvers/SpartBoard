/** Shape-only BCP-47 validation. Membership in a curated list is enforced elsewhere. */
export const LANGUAGE_TAG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
