import axios from 'axios';

type Scrubbable = {
  isAxiosError?: boolean;
  config?: { method?: string; url?: string };
  request?: unknown;
  response?: {
    status?: number;
    statusText?: string;
    headers?: unknown;
    data?: unknown;
  };
};

/** Drops the request config (auth headers, params, body) and raw request from an AxiosError so a rethrown error cannot leak them. */
export function scrubAxiosError(err: unknown): void {
  if (typeof err !== 'object' || err === null) return;
  const e = err as Scrubbable;
  if (e.isAxiosError !== true) return;
  e.config = {
    method: e.config?.method,
    url: e.config?.url?.split('?')[0],
  };
  e.request = undefined;
  if (e.response) {
    const { status, statusText, headers, data } = e.response;
    e.response = { status, statusText, headers, data };
  }
}

axios.interceptors?.response?.use(undefined, (err: unknown) => {
  scrubAxiosError(err);
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rethrows the original rejection unchanged
  return Promise.reject(err);
});
