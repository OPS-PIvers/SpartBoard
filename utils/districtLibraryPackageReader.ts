// Reads a Package file zip in the browser and validates it (docs/plans/QUIZ_MCA_PRACTICE.md M31).
import JSZip from 'jszip';
import {
  DISTRICT_PACKAGE_LIMITS,
  DISTRICT_PACKAGE_MANIFEST_PATH,
  packagePictureContentType,
  validateDistrictPackage,
  type DistrictPackageContents,
} from '@/utils/districtLibraryPackage';

export interface ReadDistrictPackage {
  contents: DistrictPackageContents;
  warnings: string[];
  /** The picture at a `pictures/...` path, typed for upload. */
  picture: (path: string) => Promise<Blob>;
}

export type ReadDistrictPackageResult =
  | { ok: true; pkg: ReadDistrictPackage }
  | { ok: false; errors: string[]; warnings: string[] };

const MB = 1024 * 1024;

/** Size the zip's own header records for an entry, read before inflating it; null when the header has none. */
export function declaredUncompressedSize(
  entry: JSZip.JSZipObject
): number | null {
  // JSZip keeps the central-directory size on an internal field it does not type.
  const size = (entry as unknown as { _data?: { uncompressedSize?: unknown } })
    ._data?.uncompressedSize;
  return typeof size === 'number' && size >= 0 ? size : null;
}

class TooLarge extends Error {}

/** Inflates text, refusing an entry whose header or actual length is over `limit` bytes. */
async function readText(
  entry: JSZip.JSZipObject,
  limit: number
): Promise<string> {
  const declared = declaredUncompressedSize(entry);
  if (declared !== null && declared > limit) throw new TooLarge(entry.name);
  const text = await entry.async('string');
  // A header can understate the size, so check what came out too.
  if (text.length > limit) throw new TooLarge(entry.name);
  return text;
}

const fail = (errors: string[]): ReadDistrictPackageResult => ({
  ok: false,
  errors,
  warnings: [],
});

export async function readDistrictPackage(
  file: Blob
): Promise<ReadDistrictPackageResult> {
  if (file.size > DISTRICT_PACKAGE_LIMITS.zipBytes) {
    return fail([
      `This file is larger than ${DISTRICT_PACKAGE_LIMITS.zipBytes / MB} MB. Split the package into smaller ones.`,
    ]);
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return fail(['This file is not a package file (it is not a zip).']);
  }
  const zipPaths = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name);

  // One budget for every JSON file, so a zip bomb can't exhaust memory before validation.
  let jsonBudget: number = DISTRICT_PACKAGE_LIMITS.jsonBytes;
  const parseJson = async (path: string): Promise<unknown> => {
    const entry = zip.file(path);
    if (!entry) return undefined;
    const text = await readText(entry, jsonBudget);
    jsonBudget -= text.length;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  };

  let manifest: unknown;
  const files: Record<string, unknown> = {};
  try {
    manifest = await parseJson(DISTRICT_PACKAGE_MANIFEST_PATH);
    if (manifest === undefined) {
      return fail([
        `The package has no readable ${DISTRICT_PACKAGE_MANIFEST_PATH}.`,
      ]);
    }
    const entryPaths = new Set<string>();
    const rawEntries = (manifest as { entries?: unknown }).entries;
    if (Array.isArray(rawEntries)) {
      for (const e of rawEntries) {
        const p = (e as { path?: unknown } | null)?.path;
        if (typeof p === 'string') entryPaths.add(p);
      }
    }
    for (const path of entryPaths) {
      const parsed = await parseJson(path);
      if (parsed !== undefined) files[path] = parsed;
    }
  } catch (err) {
    if (err instanceof TooLarge) {
      return fail([
        `The package's text files add up to more than ${DISTRICT_PACKAGE_LIMITS.jsonBytes / MB} MB once unzipped.`,
      ]);
    }
    throw err;
  }

  const result = validateDistrictPackage(manifest, zipPaths, files);
  if (!result.ok) return result;

  // Picture sizes come from the zip header, so an oversized picture is refused before any upload starts.
  const tooBig = result.contents.manifest.entries
    .flatMap((e) => e.pictures)
    .filter((path) => {
      const entry = zip.file(path);
      const size = entry ? declaredUncompressedSize(entry) : null;
      return size !== null && size > DISTRICT_PACKAGE_LIMITS.pictureBytes;
    });
  if (tooBig.length > 0) {
    return {
      ok: false,
      errors: [...new Set(tooBig)].map(
        (p) => `Picture "${p}" is larger than 10 MB.`
      ),
      warnings: result.warnings,
    };
  }

  const picture = async (path: string): Promise<Blob> => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`Picture "${path}" is not in the package.`);
    const declared = declaredUncompressedSize(entry);
    if (declared !== null && declared > DISTRICT_PACKAGE_LIMITS.pictureBytes) {
      throw new Error(`Picture "${path}" is larger than 10 MB.`);
    }
    const raw = await entry.async('blob');
    if (raw.size > DISTRICT_PACKAGE_LIMITS.pictureBytes) {
      throw new Error(`Picture "${path}" is larger than 10 MB.`);
    }
    return new Blob([raw], {
      type: packagePictureContentType(path) ?? 'application/octet-stream',
    });
  };
  return {
    ok: true,
    pkg: { contents: result.contents, warnings: result.warnings, picture },
  };
}
