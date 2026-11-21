const TRANSPORT_KEYS = ['config', 'request', 'response', 'headers', 'payload'];

function carriesRequestData(err: object, depth = 0): boolean {
  if ((err as { isAxiosError?: unknown }).isAxiosError === true) return true;
  if (TRANSPORT_KEYS.some((k) => Object.hasOwn(err, k))) return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    depth < 3 &&
    typeof cause === 'object' &&
    cause !== null &&
    carriesRequestData(cause, depth + 1)
  );
}

/** Log-safe form of a caught error: HTTP and token errors collapse to name, code and status; others pass through. */
export function safeErr(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return err;
  if (!carriesRequestData(err)) return err;
  const e = err as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const parts = [typeof e.name === 'string' ? e.name : 'Error'];
  if (typeof e.code === 'string' || typeof e.code === 'number') {
    parts.push(String(e.code));
  }
  const status = e.response?.status ?? e.status;
  if (typeof status === 'number') parts.push(`HTTP ${status}`);
  const head = parts.join(' ');
  return typeof e.message === 'string' && e.message
    ? `${head}: ${e.message.slice(0, 200)}`
    : head;
}
