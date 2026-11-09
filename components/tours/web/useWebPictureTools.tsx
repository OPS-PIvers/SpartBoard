import React, { useContext, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Crop,
  Droplets,
  Hash,
  ImageOff,
  ImageUp,
  PenLine,
  Square,
  Trash2,
} from 'lucide-react';
import type { TourMarkupShape, WebTourPicture } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { logError } from '@/utils/logError';
import {
  iconBtn,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
import {
  redactImage,
  type RedactRect,
} from '@/components/widgets/GuidedLearning/utils/redactImage';
import {
  loadWebTourPicture,
  uploadWebTourPicture,
  WEB_TOUR_PICTURE_MAX_BYTES,
} from '@/components/tours/webTours';
import { BlurEditor } from './webEditorParts';
import { PictureCache, usePictureBlob } from './webPictures';
import { WebCropEditor } from './WebCropEditor';
import { WebMarkupEditor, type MarkupTool } from './WebMarkupEditor';
import {
  blurInBase,
  cropImage,
  imageSize,
  isStepPictureType,
} from './pictureFiles';
import { cropBase, recropPicture, type UnitRect } from './pictureCrop';
import type { StageEditing } from './WebPictureStage';
import type { WebStep } from './webEditorModel';

export type PictureTool = 'blur' | 'crop' | 'markup';

const toolBtn = `${iconBtn} flex items-center gap-1.5 px-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40`;

interface Ctx {
  setId: string;
  step: WebStep | undefined;
  index: number;
  /** Saves the tour with this step's picture replaced, as one undoable edit. */
  savePicture: (
    stepId: string,
    picture: WebTourPicture | undefined
  ) => Promise<void>;
  /** Changes the picture as an undoable edit that autosaves (markup). */
  editPicture: (stepId: string, picture: WebTourPicture) => void;
  /** Asks the extension for a new picture of the step's own target. */
  retake: (step: WebStep, index: number) => void;
  canRetake: boolean;
  onStatus: (text: string) => void;
  /** Leaves picture selection, as a tool opens. */
  onToolOpened: () => void;
}

// A file's bytes as a Blob, through the editor's picture cache when it has them.
const useLoad = () => {
  const cache = useContext(PictureCache);
  return (path: string): Promise<Blob> => {
    const hit = cache?.get(path);
    return hit ?? loadWebTourPicture(path).then((b) => new Blob([b]));
  };
};

/** The stage picture's tools (E5): crop, mark up, blur, retake, replace and remove, each an undoable picture change. */
export function useWebPictureTools(ctx: Ctx) {
  const { step, index } = ctx;
  const picture = step?.web?.picture;
  // A tool belongs to the step it opened on, so selecting another step closes it.
  const [opened, setOpened] = useState<{
    tool: PictureTool;
    stepId: string;
  } | null>(null);
  const tool = opened && opened.stepId === step?.id ? opened.tool : null;
  const [markupTool, setMarkupTool] = useState<MarkupTool | null>('arrow');
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = useLoad();
  const base = usePictureBlob(
    tool === 'crop' ? (picture?.original?.path ?? picture?.path) : undefined
  );

  const open = (next: PictureTool) => {
    ctx.onToolOpened();
    setFailed(false);
    setBusy(false);
    setShapeId(null);
    if (step) setOpened({ tool: next, stepId: step.id });
  };
  const close = () => {
    setOpened(null);
    setShapeId(null);
  };

  // The blur goes on the capture too, so a later re-crop never brings back what was hidden.
  const applyBlur = async (blob: Blob, boxes: RedactRect[]) => {
    if (!step || !picture) return;
    const type = isStepPictureType(blob.type) ? blob.type : 'image/png';
    const path = await uploadWebTourPicture(ctx.setId, blob, type);
    let original = picture.original;
    if (original) {
      try {
        const full = await redactImage(
          await load(original.path),
          blurInBase(boxes, original.crop),
          { mode: 'blur' }
        );
        const fullType = isStepPictureType(full.type) ? full.type : 'image/png';
        original = {
          ...original,
          path: await uploadWebTourPicture(ctx.setId, full, fullType),
        };
      } catch (err) {
        // Without a blurred capture there is none: the picture can then only crop tighter.
        logError('web tour blur capture', err, { setId: ctx.setId });
        original = undefined;
      }
    }
    const { original: _old, ...rest } = picture;
    await ctx.savePicture(step.id, {
      ...rest,
      path,
      ...(original ? { original } : {}),
    });
    close();
  };

  const applyCrop = async (rect: UnitRect) => {
    if (!step || !picture || !base.blob) return;
    setBusy(true);
    setFailed(false);
    try {
      const cut = await cropImage(base.blob, rect);
      const path = await uploadWebTourPicture(
        ctx.setId,
        cut.blob,
        'image/jpeg'
      );
      await ctx.savePicture(
        step.id,
        recropPicture(picture, rect, { path, w: cut.w, h: cut.h })
      );
      close();
    } catch (err) {
      logError('web tour crop', err, { setId: ctx.setId });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const replace = async (file: File) => {
    if (!step) return;
    if (!isStepPictureType(file.type)) {
      ctx.onStatus('Choose a PNG, JPEG or WebP picture.');
      return;
    }
    if (file.size > WEB_TOUR_PICTURE_MAX_BYTES) {
      ctx.onStatus('Choose a picture smaller than 5 MB.');
      return;
    }
    try {
      const { w, h } = await imageSize(file);
      const path = await uploadWebTourPicture(ctx.setId, file, file.type);
      // An uploaded picture has no known target place, scale or capture behind it.
      await ctx.savePicture(step.id, { path, w, h });
      ctx.onStatus(`Step ${index + 1} has a new picture.`);
    } catch (err) {
      logError('web tour replace picture', err, { setId: ctx.setId });
      ctx.onStatus("The picture couldn't be replaced.");
    }
  };

  const commitMarkup = (shapes: TourMarkupShape[]) => {
    if (!step || !picture) return;
    const { markup: _old, ...rest } = picture;
    ctx.editPicture(
      step.id,
      shapes.length > 0 ? { ...rest, markup: shapes } : rest
    );
  };

  const toolbar = picture ? (
    <>
      <button
        type="button"
        className={toolBtn}
        onClick={() => open('crop')}
        title={
          picture.original
            ? undefined
            : 'Recorded before whole screens were kept: crop tighter only.'
        }
        {...tourAttr('web-tour-editor.picture-crop')}
      >
        <Crop className="h-4 w-4" aria-hidden="true" />
        Crop
      </button>
      <button
        type="button"
        className={toolBtn}
        onClick={() => open('markup')}
        {...tourAttr('web-tour-editor.picture-markup')}
      >
        <PenLine className="h-4 w-4" aria-hidden="true" />
        Mark up
      </button>
      <button
        type="button"
        className={toolBtn}
        onClick={() => open('blur')}
        {...tourAttr('web-tour-editor.picture-blur')}
      >
        <Droplets className="h-4 w-4" aria-hidden="true" />
        Blur
      </button>
      <button
        type="button"
        className={toolBtn}
        disabled={!ctx.canRetake || !step}
        title={
          ctx.canRetake
            ? 'Take a new picture of this control on the website'
            : 'Needs a newer SpartBoard extension in this Chrome profile.'
        }
        onClick={() => step && ctx.retake(step, index)}
        {...tourAttr('web-tour-editor.picture-retake')}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Retake
      </button>
      <button
        type="button"
        className={toolBtn}
        onClick={() => fileInput.current?.click()}
        {...tourAttr('web-tour-editor.picture-replace')}
      >
        <ImageUp className="h-4 w-4" aria-hidden="true" />
        Replace
      </button>
      {/* no-tour-anchor: hidden file picker opened by Replace */}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Replace picture"
        data-testid="web-picture-replace-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void replace(file);
        }}
      />
      <button
        type="button"
        className={toolBtn}
        onClick={() => {
          if (!step) return;
          ctx.onToolOpened();
          void ctx.savePicture(step.id, undefined);
        }}
        {...tourAttr('web-tour-editor.picture-remove')}
      >
        <ImageOff className="h-4 w-4" aria-hidden="true" />
        Remove picture
      </button>
    </>
  ) : null;

  const markupTools: {
    id: MarkupTool;
    label: string;
    icon: typeof Square;
    anchor: ReturnType<typeof tourAttr>;
  }[] = [
    {
      id: 'arrow',
      label: 'Arrow',
      icon: ArrowUpRight,
      anchor: tourAttr('web-tour-editor.markup-arrow'),
    },
    {
      id: 'box',
      label: 'Box',
      icon: Square,
      anchor: tourAttr('web-tour-editor.markup-box'),
    },
    {
      id: 'number',
      label: 'Number',
      icon: Hash,
      anchor: tourAttr('web-tour-editor.markup-number'),
    },
  ];

  const editing: StageEditing | null =
    !step || !picture || !tool
      ? null
      : tool === 'blur'
        ? {
            kind: 'blur',
            render: () => (
              <BlurEditor
                key={picture.path}
                path={picture.path}
                index={index}
                onApply={applyBlur}
                onCancel={close}
              />
            ),
          }
        : tool === 'crop'
          ? {
              kind: 'crop',
              render: (box) => (
                <WebCropEditor
                  key={picture.path}
                  base={base.blob}
                  baseSize={
                    picture.original
                      ? { w: picture.original.w, h: picture.original.h }
                      : { w: picture.w, h: picture.h }
                  }
                  box={box}
                  initial={cropBase(picture)}
                  tighterOnly={!picture.original}
                  busy={busy}
                  failed={failed}
                  onApply={(rect) => void applyCrop(rect)}
                  onCancel={close}
                />
              ),
            }
          : {
              kind: 'markup',
              render: () => (
                <>
                  <WebMarkupEditor
                    shapes={picture.markup ?? []}
                    width={picture.w}
                    height={picture.h}
                    tool={markupTool}
                    selectedId={shapeId}
                    onSelect={setShapeId}
                    onCommit={commitMarkup}
                    label={`Markup on the picture for step ${index + 1}`}
                  />
                  <div className="absolute -top-3 right-0 flex max-w-full -translate-y-full items-center gap-1 rounded-xl bg-white p-1 shadow-lg">
                    <div
                      role="radiogroup"
                      aria-label="Shape"
                      className="flex gap-0.5"
                    >
                      {markupTools.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={markupTool === t.id}
                          onClick={() =>
                            setMarkupTool(markupTool === t.id ? null : t.id)
                          }
                          className={`${toolBtn} ${
                            markupTool === t.id
                              ? 'bg-brand-blue-lighter text-brand-blue-dark'
                              : ''
                          }`}
                          {...t.anchor}
                        >
                          <t.icon className="h-4 w-4" aria-hidden="true" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {shapeId && (
                      <button
                        type="button"
                        className={`${secondaryBtn} flex items-center gap-1.5 px-2`}
                        onClick={() => {
                          commitMarkup(
                            (picture.markup ?? []).filter(
                              (s) => s.id !== shapeId
                            )
                          );
                          setShapeId(null);
                        }}
                        {...tourAttr('web-tour-editor.markup-delete')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      className={primaryBtn}
                      onClick={close}
                      {...tourAttr('web-tour-editor.markup-done')}
                    >
                      Done
                    </button>
                  </div>
                </>
              ),
            };

  /** Opens a tool on a step about to be selected (the publish check's Blur). */
  const openFor = (stepId: string, next: PictureTool) => {
    ctx.onToolOpened();
    setFailed(false);
    setShapeId(null);
    setOpened({ tool: next, stepId });
  };

  return { tool, open, openFor, close, editing, toolbar };
}
