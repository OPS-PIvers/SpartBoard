import type { ImportBlock, ImportInboxItem } from '@/utils/import/contract';
import type { PendingSource } from './importHandoff';

const blockText = (block: ImportBlock): string =>
  block.type === 'table'
    ? block.rows.map((r) => r.cells.join('\t')).join('\n')
    : block.text;

/** A Send becomes plain text (tables as tab-separated rows) that keeps its page link. */
export function sourceFromInboxItem(item: ImportInboxItem): PendingSource {
  return {
    text: item.blocks.map(blockText).join('\n'),
    url: item.url,
    title: item.title,
    sourceUrl: item.url,
    platform: item.platform,
    inboxItem: item,
  };
}
