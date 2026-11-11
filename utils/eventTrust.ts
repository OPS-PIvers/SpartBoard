/** True for an event the browser made from real user input; its own module so tests can stand in for it. */
export const isTrustedEvent = (e: Event): boolean => e.isTrusted;
