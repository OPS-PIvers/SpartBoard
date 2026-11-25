// The one image picker: upload, paste, drop, Google Drive or an image link, as a settings field or a small button.
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Link2, Loader2, Monitor, Trash2, X } from 'lucide-react';
import { GoogleDriveIcon } from '../GoogleDriveIcon';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { scrollMovesAnchor } from '@/utils/domHelpers';
import { tourFieldAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import {
  useImageSources,
  type ImageSources,
  type ImageSourcesOptions,
} from './useImageSources';

export type ImagePickerSlot =
  'open' | 'upload' | 'drive' | 'link' | 'linkInput' | 'linkAdd' | 'remove';

type Anchors = Partial<Record<ImagePickerSlot, TourAnchorAttrs>>;

export interface ImagePickerProps extends Omit<
  ImageSourcesOptions,
  'onChange' | 'scopeRef'
> {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  /** 'field' fills a settings row; 'button' is a small icon button that opens the picker under it. */
  layout?: 'field' | 'button';
  /** Names the button and the panel it opens. */
  label?: string;
  /** Live-tour scope: the widget type (or area) and field key every control is tagged with. */
  tourScope: { type: string; field: string };
  /** Existing anchor ids a migrated control keeps instead of the shared ones. */
  tourOverrides?: Anchors;
  buttonClassName?: string;
  buttonStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
}

const SLOT_TAGS: Record<
  ImagePickerSlot,
  (type: string, field: string) => TourAnchorAttrs
> = {
  open: (t, f) => tourFieldAttr('image-picker.open', t, f),
  upload: (t, f) => tourFieldAttr('image-picker.upload', t, f),
  drive: (t, f) => tourFieldAttr('image-picker.drive', t, f),
  link: (t, f) => tourFieldAttr('image-picker.link', t, f),
  linkInput: (t, f) => tourFieldAttr('image-picker.link-input', t, f),
  linkAdd: (t, f) => tourFieldAttr('image-picker.link-add', t, f),
  remove: (t, f) => tourFieldAttr('image-picker.remove', t, f),
};

/** Sits above whatever surface holds the picker, even a z-critical dialog. */
const layerZ = (el: Element | null | undefined): number => {
  let z: number = Z_INDEX.popover;
  for (let n = el ?? null; n; n = n.parentElement) {
    const v = Number(getComputedStyle(n).zIndex);
    if (Number.isFinite(v) && v + 10 > z) z = v + 10;
  }
  return z;
};

/** Drops any host layer above the Google Picker below it while the picker is open; returns the undo. */
const belowGooglePicker = (el: Element | null | undefined): (() => void) => {
  const lowered: Array<[HTMLElement, string]> = [];
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    if (Number(getComputedStyle(n).zIndex) >= Z_INDEX.googlePickerBackdrop) {
      lowered.push([n, n.style.zIndex]);
      n.style.zIndex = String(Z_INDEX.modalDeep);
    }
  }
  return () => {
    for (const [n, z] of lowered) n.style.zIndex = z;
  };
};

const btn =
  'inline-flex min-h-9 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-brand-blue-primary hover:text-brand-blue-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-40';
const iconBtn =
  'touch-target-expand rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-40';

const LinkRow: React.FC<{
  src: ImageSources;
  tag: (slot: ImagePickerSlot) => TourAnchorAttrs;
  onCancel: () => void;
}> = ({ src, tag, onCancel }) => {
  const [url, setUrl] = useState('');
  const submit = () => {
    if (!url.trim()) return;
    void src.addLink(url).then((result) => {
      if (result === 'added') onCancel();
    });
  };
  return (
    <div className="flex w-full items-center gap-2">
      <input
        {...tag('linkInput')}
        type="url"
        value={url}
        autoFocus
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder="Paste an image link"
        aria-label="Image link"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
        disabled={src.busy}
      />
      <button
        {...tag('linkAdd')}
        type="button"
        onClick={submit}
        disabled={src.busy || !url.trim()}
        className="min-h-9 shrink-0 rounded-lg bg-brand-blue-primary px-3 py-2 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
      >
        Add
      </button>
      {/* no-tour-anchor: closes the link field the Image link button opened */}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel image link"
        className={`${iconBtn} hover:text-slate-800`}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
};

/** Upload, Google Drive and Image link side by side; Image link opens its field in place. */
const SourceButtons: React.FC<{
  src: ImageSources;
  tag: (slot: ImagePickerSlot) => TourAnchorAttrs;
  stretch?: boolean;
}> = ({ src, tag, stretch }) => {
  const [linking, setLinking] = useState(false);
  if (linking) {
    return <LinkRow src={src} tag={tag} onCancel={() => setLinking(false)} />;
  }
  const grow = stretch
    ? '[@container(min-width:24rem)]:flex-1 [@container(min-width:24rem)]:basis-0'
    : '';
  return (
    <div className="flex w-full flex-col justify-center gap-2 [@container(min-width:24rem)]:flex-row">
      <button
        {...tag('upload')}
        type="button"
        onClick={src.openFile}
        disabled={src.busy}
        className={`${btn} ${grow}`}
      >
        <Monitor size={14} aria-hidden />
        Upload
      </button>
      <button
        {...tag('drive')}
        type="button"
        onClick={() => void src.openDrive()}
        disabled={src.busy}
        className={`${btn} ${grow}`}
      >
        <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
        Google Drive
      </button>
      <button
        {...tag('link')}
        type="button"
        onClick={() => setLinking(true)}
        disabled={src.busy}
        className={`${btn} ${grow}`}
      >
        <Link2 size={14} aria-hidden />
        Image link
      </button>
    </div>
  );
};

const DropZone: React.FC<{
  src: ImageSources;
  tag: (slot: ImagePickerSlot) => TourAnchorAttrs;
  tall?: boolean;
}> = ({ src, tag, tall }) => (
  <div
    {...src.dropProps}
    className={`flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-3 text-center transition-colors ${
      tall ? 'py-6' : 'py-4'
    } ${
      src.dragging
        ? 'border-brand-blue-primary bg-blue-50'
        : 'border-slate-300 bg-slate-50'
    }`}
  >
    <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
      {src.busy ? (
        <Loader2 size={18} className="animate-spin" aria-hidden />
      ) : (
        <ImagePlus size={18} aria-hidden />
      )}
      {src.busy ? 'Adding image' : 'Drop or paste an image'}
    </div>
    <SourceButtons src={src} tag={tag} />
  </div>
);

const ErrorLine: React.FC<{ src: ImageSources }> = ({ src }) =>
  src.error ? (
    <p role="alert" className="text-xs font-semibold text-brand-red-primary">
      {src.error}
    </p>
  ) : null;

type PanelPos = { top: number; left: number; z: number };

/** Places the panel under the button, or above it near the bottom of the screen. */
const panelPos = (el: HTMLElement): PanelPos => {
  const r = el.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const below = r.bottom + 6;
  return {
    top: below + 220 > window.innerHeight ? Math.max(8, r.top - 226) : below,
    left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
    z: layerZ(el),
  };
};

/** The drop box in a small panel under the button, above any dialog. */
const Panel: React.FC<{
  anchor: React.RefObject<HTMLElement | null>;
  pos: PanelPos;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  panelRef: React.RefObject<HTMLDivElement | null>;
}> = ({ anchor, pos, label, onClose, children, panelRef }) => {
  const ignore = useMemo(() => [anchor], [anchor]);
  useClickOutside(panelRef, onClose, ignore);
  // Focus moves into the panel so Tab, Escape and paste work there.
  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('button:not([disabled])')
      ?.focus();
  }, [panelRef]);
  // The panel is placed once, so it closes when its button moves.
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onScroll = (e: Event) => {
      if (scrollMovesAnchor(e, anchor.current)) closeRef.current();
    };
    const onResize = () => closeRef.current();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      data-click-outside-ignore="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          anchor.current?.focus();
        }
      }}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 'min(360px, calc(100vw - 16px))',
        zIndex: pos.z,
      }}
      className="flex flex-col gap-2 rounded-2xl [container-type:inline-size] border border-slate-200 bg-white p-3 shadow-xl"
    >
      {children}
    </div>,
    document.body
  );
};

export const ImagePicker: React.FC<ImagePickerProps> = ({
  value,
  onChange,
  onRemove,
  layout = 'field',
  label = 'Add image',
  tourScope,
  tourOverrides,
  buttonClassName,
  buttonStyle,
  iconStyle,
  ...sourceOptions
}) => {
  const [panel, setPanel] = useState<PanelPos | null>(null);
  const open = panel !== null;
  const setOpen = (next: boolean) => {
    if (!next) setPanel(null);
    else if (triggerRef.current) setPanel(panelPos(triggerRef.current));
  };
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const isButton = layout === 'button';
  const src = useImageSources({
    ...sourceOptions,
    // A small button takes a paste only while its panel is open.
    pasteScope:
      isButton && !open ? 'off' : (sourceOptions.pasteScope ?? 'dialog'),
    scopeRef: isButton ? panelRef : fieldRef,
    onChange: (url) => {
      onChange(url);
      setOpen(false);
    },
  });
  // The Google Picker must sit above the panel and any z-critical host while it is open.
  const pickFromDrive = async () => {
    const host = isButton ? triggerRef.current : fieldRef.current;
    if (isButton) setOpen(false);
    const restore = belowGooglePicker(host);
    const result = await src.openDrive().finally(restore);
    if (isButton && result === 'failed') setOpen(true);
    return result;
  };
  const view: ImageSources = { ...src, openDrive: pickFromDrive };
  const tag = (slot: ImagePickerSlot): TourAnchorAttrs =>
    tourOverrides?.[slot] ?? SLOT_TAGS[slot](tourScope.type, tourScope.field);

  if (isButton) {
    return (
      <>
        {src.fileInput}
        <button
          {...tag('open')}
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          disabled={src.busy || sourceOptions.disabled}
          aria-label={label}
          title={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={
            buttonClassName ??
            'rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
          }
          style={buttonStyle}
          {...src.dropProps}
        >
          {src.busy ? (
            <Loader2
              style={iconStyle}
              size={16}
              className="animate-spin"
              aria-hidden
            />
          ) : (
            <ImagePlus style={iconStyle} size={16} aria-hidden />
          )}
        </button>
        {panel && (
          <Panel
            anchor={triggerRef}
            pos={panel}
            panelRef={panelRef}
            label={label}
            onClose={() => setOpen(false)}
          >
            <DropZone src={view} tag={tag} />
            <ErrorLine src={src} />
          </Panel>
        )}
      </>
    );
  }

  return (
    <div
      ref={fieldRef}
      className="flex flex-col gap-2 [container-type:inline-size]"
    >
      {src.fileInput}
      {value ? (
        <>
          <div
            {...src.dropProps}
            className={`flex items-center gap-3 rounded-xl border p-2 ${
              src.dragging
                ? 'border-brand-blue-primary bg-blue-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <img
              src={value}
              alt=""
              referrerPolicy="no-referrer"
              className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover"
            />
            <div className="min-w-0 flex-1 text-xs font-bold text-slate-700">
              {src.busy ? 'Adding image' : 'Image added'}
            </div>
            {onRemove && (
              <button
                {...tag('remove')}
                type="button"
                onClick={onRemove}
                disabled={src.busy}
                aria-label="Remove image"
                title="Remove image"
                className={`${iconBtn} hover:text-brand-red-primary`}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            )}
          </div>
          <SourceButtons src={view} tag={tag} stretch />
        </>
      ) : (
        <DropZone src={view} tag={tag} tall />
      )}
      <ErrorLine src={src} />
    </div>
  );
};
