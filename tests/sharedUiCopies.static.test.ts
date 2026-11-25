import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a new copy of a shared UI piece appears: toasts, clipboard copy, the class picker, CSV parsing, MM:SS.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const filesMatching = (pattern: string): string[] => {
  try {
    return execFileSync(
      'git',
      [
        'grep',
        '-lE',
        pattern,
        '--',
        '*.ts',
        '*.tsx',
        ':!*.test.*',
        ':!tests/',
        ':!extension/',
        ':!functions/',
        ':!scripts/',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
};

// These lists only shrink: move a file onto the shared piece and delete its entry.
const CLIPBOARD_WRITERS = [
  'components/admin/Announcements/EmbedConfigEditor.tsx',
  'components/admin/Organization/OrganizationPanel.tsx',
  'components/boardsModal/useSubShares.ts',
  'components/classes/course/FamilyLinkSetup.tsx',
  'components/common/library/ViewOnlyShareModal.tsx',
  'components/common/library/importer/ImportWizard.tsx',
  'components/layout/BoardMenuHost.tsx',
  'components/layout/RemoteControlMenu.tsx',
  'components/share/ShareCollectionLinkCreatorModal.tsx',
  'components/share/ShareLinkCreatorModal.tsx',
  'components/share/ShareWithSubModal.tsx',
  'components/tours/editor/TourEditorSessionView.tsx',
  'components/tours/publicLink/usePublicLinkControls.tsx',
  'components/tours/web/WebTourEditor.tsx',
  'components/tours/web/WebTourList.tsx',
  'components/tours/web/useCopyWebTourLink.ts',
  'components/widgets/ActivityWall/ShareModal.tsx',
  'components/widgets/QuizWidget/components/results/StudentResultsBulkBar.tsx',
  'hooks/useCopyShortLink.ts',
  'hooks/useQuizLinkShare.ts',
  'utils/copyText.ts',
];

const LOCAL_TOAST_COMPONENT = [
  'components/admin/BackgroundManager/index.tsx',
  'components/admin/FeaturePermissionsManager.tsx',
  'components/admin/VideoActivityConfigurationModal.tsx',
  'components/dev/NotebookViewsDevHarness.tsx',
  'components/widgets/InstructionalRoutines/LibraryManager.tsx',
];

describe('shared UI pieces', () => {
  it('copies to the clipboard through copyText or copyLinkWithToast', () => {
    expect(
      filesMatching(String.raw`clipboard\.writeText\(`),
      'Use copyText (utils/copyText) or copyLinkWithToast (hooks/useCopyShortLink) instead of navigator.clipboard.writeText.'
    ).toEqual(CLIPBOARD_WRITERS);
  });

  it('shows toasts through addToast, not a local toast', () => {
    expect(
      filesMatching(String.raw`from '@/components/common/Toast'`),
      "Use addToast from useDashboard() (pass an action for Undo). Don't render a local <Toast>."
    ).toEqual(LOCAL_TOAST_COMPONENT);
  });

  it('picks classes with ClassChecklist', () => {
    expect(
      filesMatching(String.raw`AssignClassPicker'|library/PeriodSelector'`),
      'Use ClassChecklist (components/common/library/assignStepper/ClassChecklist).'
    ).toEqual([]);
  });

  it('parses CSV and MM:SS in one place', () => {
    expect(
      filesMatching(
        String.raw`function (parseCsvRecords|mmSsToSeconds|secondsToMmSs)\b`
      ),
      'Use parseCsvRecords/csvDataRows (utils/csv) and mmSsToSeconds/secondsToMmSs (utils/videoTimestamp).'
    ).toEqual(['utils/csv.ts', 'utils/videoTimestamp.ts']);
  });
});
