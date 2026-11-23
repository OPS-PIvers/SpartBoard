/** Posts were cleared but the wall could not be reopened for students. */
export class WallStillClosedError extends Error {
  constructor(cause: unknown) {
    super('Posts cleared but the wall is still closed', { cause });
    this.name = 'WallStillClosedError';
  }
}
