// A versioned AI read in the browser: each version mapped, its pictures cropped and compared (QUIZ_IMPORT_VERSIONS V4, V7).
import { aiQuizToExtracted } from './aiReader';
import {
  cropPdfFigures,
  figureKey,
  type FigureBox,
  type PdfCropperDeps,
} from './pdfFigures';
import {
  figureCaption,
  linkIdenticalFigures,
  type Pixels,
} from './figureMatch';
import type {
  ExtractedImage,
  ExtractedQuestion,
  ExtractedTestSet,
  ImportedTestSet,
  ImportedVersion,
} from './types';

export const VERSION_PICTURES_SKIPPED =
  'Pictures in this file couldn’t be brought in. Add them in the editor.';

export interface TestSetReadOptions {
  fallbackTitle: string;
  multiAnswer?: boolean;
  /** Absent for a Word file, which has no pages to crop. */
  cropper?: () => Promise<PdfCropperDeps>;
  decodePixels?: (blob: Blob) => Promise<Pixels | null>;
}

/** One version read either way, each question's figure boxes beside it. */
export interface MappedVersion {
  label: string;
  title: string;
  warnings: string[];
  questions: ExtractedQuestion[];
  figures: FigureBox[][];
}

export async function readTestSet(
  set: ExtractedTestSet,
  options: TestSetReadOptions
): Promise<ImportedTestSet> {
  const reader = { multiAnswer: options.multiAnswer === true };
  const mapped = set.versions.map((v): MappedVersion => {
    const quiz = aiQuizToExtracted(
      { title: v.title, questions: v.questions ?? [], warnings: v.warnings },
      v.label,
      reader
    );
    return {
      label: v.label,
      title: quiz.title,
      warnings: quiz.warnings,
      questions: quiz.questions,
      figures: quiz.questions.map((_, qi) => v.questions?.[qi]?.figures ?? []),
    };
  });
  return assembleTestSet(set, mapped, options);
}

/** Crops every version's pictures once and links the identical ones (V4). */
export async function assembleTestSet(
  set: Omit<ExtractedTestSet, 'kind' | 'versions'>,
  mapped: readonly MappedVersion[],
  options: TestSetReadOptions
): Promise<ImportedTestSet> {
  const warnings = [...(set.warnings ?? [])];
  const boxes = mapped.flatMap((m) => m.figures.flat());
  let cropped: Awaited<ReturnType<typeof cropPdfFigures>> | null = null;
  if (boxes.length > 0) {
    if (!options.cropper) warnings.push(VERSION_PICTURES_SKIPPED);
    else {
      try {
        cropped = await cropPdfFigures(boxes, await options.cropper());
        warnings.push(...cropped.warnings);
      } catch (err) {
        console.warn('[quizDocumentImport] could not crop the PDF', err);
        warnings.push(VERSION_PICTURES_SKIPPED);
      }
    }
  }

  const sourceById = new Map(cropped?.images.map((i) => [i.id, i]) ?? []);
  const images: ExtractedImage[] = [];
  const imageVersion: Record<string, number> = {};
  const sourceOf = new Map<string, string>();
  const versions: ImportedVersion[] = mapped.map((m, v) => ({
    label: m.label,
    title: m.title,
    warnings: m.warnings,
    questions: m.questions.map((question, qi) => {
      const ids = (m.figures[qi] ?? []).flatMap((box) => {
        const sourceId = cropped?.idByBox.get(figureKey(box));
        const source = sourceId ? sourceById.get(sourceId) : undefined;
        if (!sourceId || !source) return [];
        const id = `v${v + 1}-${sourceId}`;
        if (!(id in imageVersion)) {
          imageVersion[id] = v;
          sourceOf.set(id, sourceId);
          images.push({
            ...source,
            id,
            name: figureCaption(box, set.figures ?? []) ?? source.name,
          });
        }
        return [id];
      });
      return ids.length > 0 ? { ...question, imageIds: ids } : question;
    }),
  }));

  const decode = options.decodePixels;
  const pixelsBySource = new Map<string, Pixels | null>();
  if (decode) {
    for (const [sourceId, source] of sourceById) {
      pixelsBySource.set(sourceId, await decode(source.blob));
    }
  }
  const sharedImages = linkIdenticalFigures(
    images.map((img) => {
      const sourceKey = sourceOf.get(img.id);
      return {
        id: img.id,
        version: imageVersion[img.id],
        ...(sourceKey ? { sourceKey } : {}),
        pixels: sourceKey ? (pixelsBySource.get(sourceKey) ?? null) : null,
      };
    })
  );

  return {
    title: (set.title ?? '').trim() || options.fallbackTitle,
    fileTitle: options.fallbackTitle,
    versions,
    rubrics: set.rubrics ?? [],
    groups: set.groups ?? [],
    images,
    sharedImages,
    imageVersion,
    warnings,
  };
}
