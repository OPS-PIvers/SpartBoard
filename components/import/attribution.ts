import type { ImportAttribution } from '@/utils/import/contract';
import type { PendingSource } from './importHandoff';

/** The `importedFrom` line for a Source that came from a web page; files and pasted text have none. */
export function attributionFor(
  source: PendingSource | undefined
): ImportAttribution | undefined {
  const url = source?.sourceUrl;
  if (!source || !url || !/^https?:\/\//i.test(url)) return undefined;
  // A teacher's own Google Sheet is their file, not a page they found.
  if (/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(url))
    return undefined;
  return {
    sourceUrl: url,
    sourceTitle: (source.title ?? '').slice(0, 500),
    ...(source.platform ? { platform: source.platform } : {}),
    importedAt: Date.now(),
  };
}
