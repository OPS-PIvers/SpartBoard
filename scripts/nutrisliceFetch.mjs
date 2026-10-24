// Fetches one Nutrislice URL, retrying 5xx responses and thrown network errors.
export const fetchJsonWithRetry = async (
  url,
  {
    maxAttempts = 3,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {}
) => {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    if (attempt >= maxAttempts || res.status < 500) {
      throw new Error(`Nutrislice ${res.status} for ${url}`);
    }
    await sleep(2000 * attempt);
  }
};
