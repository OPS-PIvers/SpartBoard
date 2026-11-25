import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails on a new raw image file input; every image is added through the shared ImagePicker.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX = [
  'Add images with <ImagePicker> from components/common/imagePicker/ImagePicker.tsx (layout "field" for a settings row, "button" for a tight spot).',
  'It gives every place upload, paste, drag and drop, Google Drive and an image link. Pass your own upload so the image still saves where it does today.',
  'If the picker is missing something, extend it there instead of adding an <input type="file" accept="image/*">.',
].join('\n');

const SHARED = 'components/common/imagePicker/';

// Raw image inputs still waiting to move onto the shared picker, per file. Only shrinks.
const NOT_YET_MIGRATED: Record<string, number> = {
  'components/admin/BackgroundManager/index.tsx': 1,
  'components/admin/CatalystConfigurationModal.tsx': 2,
  'components/admin/FeatureConfigurationPanel.tsx': 1,
  'components/admin/MusicManager.tsx': 1,
  'components/admin/Organization/views/AppSettingsView.tsx': 1,
  'components/admin/RecessGearConfigurationPanel.tsx': 1,
  'components/admin/RoutineGuideConfigurationPanel.tsx': 1,
  'components/admin/StickerLibraryModal.tsx': 1,
  'components/admin/WorkSymbolsConfigurationModal.tsx': 1,
  'components/backgroundsModal/BackgroundsUploadsPanel.tsx': 1,
  'components/settings/renderer/fields/ImageUpload.tsx': 1,
  'components/tours/web/useWebPictureTools.tsx': 1,
  'components/widgets/DrawingWidget/useImageInsertion.ts': 2,
  'components/widgets/Flashcards/CardImageControls.tsx': 1,
  'components/widgets/GuidedLearning/components/GuidedLearningAIGenerator.tsx': 1,
  'components/widgets/GuidedLearning/components/studio/StudioFilmstrip.tsx': 1,
  'components/widgets/GuidedLearning/components/studio/StudioWelcomePanel.tsx': 1,
  'components/widgets/HotspotImage/settingsFields.tsx': 1,
  'components/widgets/InstructionalRoutines/LibraryManager.tsx': 2,
  'components/widgets/QuizWidget/components/PaperSheetStimuliSection.tsx': 1,
  'components/widgets/QuizWidget/components/WhiteboardInsertImageModal.tsx': 1,
  'components/widgets/QuizWidget/components/useAnswerImagePicker.tsx': 1,
  'components/widgets/SmartNotebook/components/PageEditorOverlay.tsx': 1,
  'components/widgets/Stations/components/IconOrImageInput.tsx': 1,
  // Kept behind the unified-image-picker flag until it is retired.
  'components/widgets/UrlWidget/LinkBackgroundInput.tsx': 1,
  'components/widgets/stickers/StickerBookWidget.tsx': 1,
  // Guided Learning slide media takes images and video; the picker needs a video option first.
  'utils/guidedLearningMedia.ts': 1,
};

// Inputs that take images but are not image pickers, with the reason.
const NOT_A_PICKER: Record<string, number> = {
  // Scans of paper answer sheets and test pages to read, not an image to show.
  'components/widgets/QuizWidget/components/PaperImportModal.tsx': 1,
  'components/widgets/QuizWidget/components/PaperPrintModal.tsx': 1,
  'components/widgets/QuizWidget/components/PaperQuestionTextModal.tsx': 1,
  // Phone camera capture for the remote.
  'components/remote/controls/RemoteWebcamControl.tsx': 1,
  // Any-file adds (image, audio, video, PDF) through the shared FileAddSources.
  'components/common/library/assignStepper/SupportsEditor.tsx': 1,
  'components/widgets/QuizWidget/components/StimulusManagerPanel.tsx': 1,
};

// accept= or accept: with an image type or extension, or a *_ACCEPT constant naming one.
const RAW_IMAGE_ACCEPT =
  /(\baccept\s*[=:]\s*\{?[^}\n]*['"`][^'"`]*(?:image\/|\.(?:png|jpe?g|gif|webp)\b)|_ACCEPT\s*=\s*['"`][^'"`]*image\/)/g;

const countsByFile = (): Record<string, number> => {
  const files = execFileSync(
    'git',
    ['ls-files', 'components', 'hooks', 'utils', 'context', 'config'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .filter((f) => !f.startsWith(SHARED));
  const out: Record<string, number> = {};
  for (const f of files) {
    const n = (
      readFileSync(resolve(repoRoot, f), 'utf8').match(RAW_IMAGE_ACCEPT) ?? []
    ).length;
    if (n > 0) out[f] = n;
  }
  return out;
};

describe('image pickers go through the shared ImagePicker', () => {
  const actual = countsByFile();
  const allowed = { ...NOT_YET_MIGRATED };
  for (const [f, n] of Object.entries(NOT_A_PICKER)) {
    allowed[f] = (allowed[f] ?? 0) + n;
  }

  it('has no new raw image file input', () => {
    const over = Object.entries(actual)
      .filter(([f, n]) => n > (allowed[f] ?? 0))
      .map(
        ([f, n]) => `${f}: ${n} raw image input(s), allowed ${allowed[f] ?? 0}`
      );
    expect(over, `${over.join('\n')}\n\n${FIX}`).toEqual([]);
  });

  it('lowers the allowlist when a file moves onto the picker', () => {
    const stale = Object.entries(allowed)
      .filter(([f, n]) => (actual[f] ?? 0) < n)
      .map(
        ([f, n]) =>
          `${f}: allowlist says ${n}, file has ${actual[f] ?? 0}. Lower or delete its entry in tests/imagePickers.static.test.ts.`
      );
    expect(stale).toEqual([]);
  });
});
