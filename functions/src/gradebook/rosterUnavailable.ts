// Raised when the class roster service can't answer, so the recompute retries instead of counting a failure.
export class RosterUnavailableError extends Error {
  constructor(readonly causeError: unknown) {
    super('Class roster lookup unavailable');
    this.name = 'RosterUnavailableError';
  }
}
