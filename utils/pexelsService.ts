export interface PexelsPhoto {
  id: number;
  photographer: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    medium: string;
  };
}

export interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
  per_page: number;
  next_page?: string;
}

const API_BASE = 'https://api.pexels.com/v1';

function getApiKey(): string | undefined {
  return import.meta.env.VITE_PEXELS_API_KEY as string | undefined;
}

export function isPexelsConfigured(): boolean {
  return !!getApiKey();
}

async function pexelsFetch(url: string): Promise<PexelsSearchResponse> {
  const key = getApiKey();
  if (!key) throw new Error('Pexels API key not configured');

  const res = await fetch(url, {
    headers: { Authorization: key },
  });

  if (!res.ok) {
    if (res.status === 429)
      throw new Error('Rate limit reached. Try again shortly.');
    throw new Error(`Pexels API error: ${res.status}`);
  }

  return res.json() as Promise<PexelsSearchResponse>;
}

export function searchPhotos(
  query: string,
  page = 1,
  perPage = 24
): Promise<PexelsSearchResponse> {
  return pexelsFetch(
    `${API_BASE}/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=landscape`
  );
}

export function getCuratedPhotos(
  page = 1,
  perPage = 24
): Promise<PexelsSearchResponse> {
  return pexelsFetch(`${API_BASE}/curated?page=${page}&per_page=${perPage}`);
}
