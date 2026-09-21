/**
 * Whether a quiz's sheet images can be opened by a PLC teammate, and the ask
 * that changes that (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D6).
 *
 * Sheet images are uploaded unshared, because `drive.file` lets the owner read
 * their own file with their own token and nobody else read it at all. A
 * teammate printing the owner's stack therefore gets an empty box until the
 * owner says the image may be opened by anyone with the link. Pure apart from
 * its injected Drive calls, so the decision is testable without a token.
 */

import type { PaperSheetStimulus } from '@/types';

/** Drive files behind a quiz's sheet images, each one once. */
export function sheetImageFileIds(
  stimuli: readonly PaperSheetStimulus[]
): string[] {
  const ids = stimuli
    .filter((s) => s.source === 'image' && s.driveFileId)
    .map((s) => s.driveFileId as string);
  return [...new Set(ids)];
}

/**
 * The sheet images a teammate could not open. A file whose permissions cannot
 * be read is left out: the owner is told what to share, not asked to fix
 * something the app is only guessing about.
 */
export async function findUnsharedSheetImages(
  stimuli: readonly PaperSheetStimulus[],
  isLinkShared: (fileId: string) => Promise<boolean>
): Promise<PaperSheetStimulus[]> {
  const shared = new Map<string, boolean>();
  await Promise.all(
    sheetImageFileIds(stimuli).map(async (fileId) => {
      shared.set(fileId, await isLinkShared(fileId).catch(() => true));
    })
  );
  return stimuli.filter(
    (s) => s.driveFileId && shared.get(s.driveFileId) === false
  );
}

/** What the teacher is being asked to allow, in their own words. */
export function shareSheetImagesPrompt(
  unshared: readonly PaperSheetStimulus[]
): string {
  const names = unshared.map((s) => `"${s.label}"`).join(', ');
  return unshared.length === 1
    ? `${names} is only visible to you, so it prints as an empty box for anyone else in this PLC.`
    : `${names} are only visible to you, so they print as empty boxes for anyone else in this PLC.`;
}

/** Share each one, and name any Drive would not. */
export async function shareSheetImages(
  unshared: readonly PaperSheetStimulus[],
  share: (fileId: string) => Promise<void>
): Promise<PaperSheetStimulus[]> {
  const failed: PaperSheetStimulus[] = [];
  for (const fileId of sheetImageFileIds(unshared)) {
    try {
      await share(fileId);
    } catch {
      failed.push(...unshared.filter((s) => s.driveFileId === fileId));
    }
  }
  return failed;
}
