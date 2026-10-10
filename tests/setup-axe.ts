import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-unused-vars -- type params must match vitest's declaration */
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    toHaveNoViolations(): void;
  }
}
