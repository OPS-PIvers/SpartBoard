import { FocusNames } from './FocusNames';
import type { WidgetStub } from './types';

// No backend in the harness: Focus callables get the error an offline call would, without a CORS console error.
function installFocusCallableStub() {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (/\/focus[A-Za-z]+V1(?:$|\?)/.test(url))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: { status: 'UNAVAILABLE', message: 'No backend here.' },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      );
    return realFetch(input, init);
  };
}

export const focusStub: WidgetStub = {
  install: installFocusCallableStub,
  Wrapper: FocusNames,
};
