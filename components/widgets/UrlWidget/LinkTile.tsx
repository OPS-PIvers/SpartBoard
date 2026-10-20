import React from 'react';
import { UrlWidgetConfig, WidgetType } from '@/types';
import { tourFieldAttr } from '@/config/tourAnchors';
import { isSafeIconUrl } from '@/components/widgets/Catalyst/catalystHelpers';
import { getUrlIcon, DEFAULT_URL_COLOR } from './icons';
import { toSafeLinkHref } from './url';
import { ICON_PER_FONT, linkLabelFontSize } from './labelFit';

export type UrlLink = UrlWidgetConfig['urls'][number];

interface LinkProps {
  link: UrlLink;
  widgetType: WidgetType;
}

const getDisplayLabel = (title?: string, url?: string) => {
  const trimmedTitle = title?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
};

const openLink = (url: string) => {
  const href = toSafeLinkHref(url);
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
};

const linkImage = (link: UrlLink): string | null => {
  const trimmed = link.imageUrl?.trim();
  return trimmed && isSafeIconUrl(trimmed) ? trimmed : null;
};

const LinkImage: React.FC<{ src: string }> = ({ src }) => (
  <img
    src={src}
    alt=""
    referrerPolicy="no-referrer"
    loading="lazy"
    aria-hidden="true"
    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
  />
);

const LinkIcon: React.FC<{ id?: string; style: React.CSSProperties }> = ({
  id,
  style,
}) =>
  React.createElement(getUrlIcon(id), {
    className: 'text-white drop-shadow-sm z-10',
    style,
  });

const PRESS_CLASS =
  'cursor-pointer outline-none transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset [-webkit-tap-highlight-color:transparent]';

/** One link as a square-ish tile: icon and label, or a background image with a label plate. */
export const LinkTile: React.FC<LinkProps> = ({ link, widgetType }) => {
  const label = getDisplayLabel(link.title, link.url);
  const isCircle = link.shape === 'circle';
  const image = linkImage(link);
  const labelSize = linkLabelFontSize(label ?? '', {
    withIcon: !image,
    circle: isCircle,
  });
  const radiusClass = isCircle ? 'rounded-full' : 'rounded-[min(16px,3cqmin)]';
  return (
    <div
      className="relative flex items-center justify-center min-w-0 min-h-0 flex-1"
      style={{ containerType: 'size' }}
    >
      <div
        className={`relative overflow-hidden transition-all group shadow-sm hover:shadow-md border border-white/20 hover:brightness-110 ${radiusClass} ${
          isCircle ? 'aspect-square' : 'h-full w-full'
        }`}
        style={{
          ...(isCircle ? { height: '100cqmin', width: '100cqmin' } : null),
          backgroundColor: image
            ? '#1e293b'
            : (link.color ?? DEFAULT_URL_COLOR),
          containerType: 'size',
        }}
      >
        {image && <LinkImage src={image} />}
        <button
          type="button"
          {...tourFieldAttr('url.open-link', widgetType, link.id)}
          onClick={() => openLink(link.url)}
          aria-label={`Open ${label}`}
          className={`absolute inset-0 flex flex-col items-center justify-center text-left ${PRESS_CLASS}`}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors pointer-events-none ${radiusClass}`}
          />
          {image ? (
            <span
              className="absolute left-0 right-0 bottom-0 z-10 font-black text-white text-center leading-tight break-words"
              style={{
                fontSize: labelSize,
                padding: 'min(8px, 4cqmin) min(10px, 5cqmin)',
                backgroundColor: 'rgba(15, 23, 42, 0.42)',
                backdropFilter: 'blur(min(4px, 2cqmin))',
                WebkitBackdropFilter: 'blur(min(4px, 2cqmin))',
              }}
            >
              {label}
            </span>
          ) : (
            <>
              <LinkIcon
                id={link.icon}
                style={{
                  width: `min(120px, 38cqmin, calc(${labelSize} * ${ICON_PER_FONT}))`,
                  height: `min(120px, 38cqmin, calc(${labelSize} * ${ICON_PER_FONT}))`,
                  marginBottom: 'min(4px, 1.5cqmin)',
                }}
              />
              <span
                className="font-black text-white text-center leading-tight drop-shadow-md break-words max-w-full z-10"
                style={{
                  fontSize: labelSize,
                  padding: '0 min(6px, 1.5cqmin)',
                }}
              >
                {label}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/** One link as a compact row: the label alone, kept readable when tiles would be too small. */
export const LinkRow: React.FC<LinkProps> = ({ link, widgetType }) => {
  const label = getDisplayLabel(link.title, link.url);
  const image = linkImage(link);
  return (
    <button
      type="button"
      {...tourFieldAttr('url.open-link', widgetType, link.id)}
      onClick={() => openLink(link.url)}
      aria-label={`Open ${label}`}
      className={`relative overflow-hidden flex items-center justify-center border border-white/20 shadow-sm hover:brightness-110 rounded-[min(10px,3cqmin)] ${PRESS_CLASS}`}
      style={{
        backgroundColor: image ? '#1e293b' : (link.color ?? DEFAULT_URL_COLOR),
        minHeight: 'max(28px, 12cqmin)',
        padding: 'min(6px, 2cqmin) min(8px, 3cqmin)',
      }}
    >
      {image && <LinkImage src={image} />}
      {image && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
        />
      )}
      <span
        className="relative font-black text-white text-center leading-tight [overflow-wrap:anywhere]"
        style={{ fontSize: 'clamp(10px, 8cqmin, 16px)' }}
      >
        {label}
      </span>
    </button>
  );
};
