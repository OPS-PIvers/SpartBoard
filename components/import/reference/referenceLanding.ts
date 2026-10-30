import type { AddWidgetOverrides, WidgetType } from '@/types';
import { ensureProtocol } from '@/utils/urlHelpers';
import { computeWidgetSizeForImage } from '@/utils/imageProcessing';

export interface ReferenceWidget {
  type: Extract<WidgetType, 'embed' | 'url' | 'sticker'>;
  overrides: AddWidgetOverrides;
}

const titleOrUndefined = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed ? { customTitle: trimmed.slice(0, 120) } : {};
};

/** An Embed of a page, slide deck or document; the widget rewrites provider links at render, keeping a linked slide (D12). */
export function buildEmbedReference(
  url: string,
  title?: string
): ReferenceWidget {
  return {
    type: 'embed',
    overrides: {
      config: {
        url: ensureProtocol(url),
        mode: 'url',
        isEmbeddable: true,
        blockedReason: '',
      },
      ...titleOrUndefined(title),
    },
  };
}

/** The Links widget fallback when a site refuses framing and the teacher still wants it on the board. */
export function buildLinkReference(
  url: string,
  title?: string
): ReferenceWidget {
  const href = ensureProtocol(url);
  const trimmedTitle = title?.trim() ?? '';
  let fallbackTitle = href;
  try {
    fallbackTitle = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    // Keep the raw url as the title.
  }
  return {
    type: 'url',
    overrides: {
      config: {
        urls: [
          {
            id: crypto.randomUUID(),
            url: href,
            title: trimmedTitle.length > 0 ? trimmedTitle : fallbackTitle,
          },
        ],
      },
    },
  };
}

/** A photo on the board as a full-image sticker sized to the photo's shape (D13). */
export function buildPhotoSticker(
  imageUrl: string,
  dims: { width: number; height: number } | null
): ReferenceWidget {
  return {
    type: 'sticker',
    overrides: {
      ...(dims ? computeWidgetSizeForImage(dims) : {}),
      config: { url: imageUrl, rotation: 0 },
    },
  };
}
