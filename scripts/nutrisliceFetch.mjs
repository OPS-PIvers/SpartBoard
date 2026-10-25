// Fetches one Nutrislice URL, retrying 5xx responses, network errors and stalled attempts.
export const fetchJsonWithRetry = async (
  url,
  {
    maxAttempts = 3,
    timeoutMs = 20_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {}
) => {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(2000 * attempt);
      continue;
    }
    if (attempt >= maxAttempts || res.status < 500) {
      throw new Error(`Nutrislice ${res.status} for ${url}`);
    }
    await sleep(2000 * attempt);
  }
};
