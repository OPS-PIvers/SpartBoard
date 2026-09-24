import type { TFunction } from 'i18next';
import type { SlideUploadIssue } from '../useGuidedLearningEditorState';

export function uploadIssueMessage(t: TFunction, issue: SlideUploadIssue) {
  switch (issue.code) {
    case 'unsupported':
      return t('glStudio.uploadUnsupported', { name: issue.fileName });
    case 'tooLarge':
      return t(
        issue.kind === 'video'
          ? 'glStudio.uploadTooLargeVideo'
          : 'glStudio.uploadTooLargeImage',
        { name: issue.fileName, max: issue.maxMb }
      );
    case 'uploadFailed':
      return t('glStudio.uploadFailed', { name: issue.fileName });
    case 'noClipboardImage':
      return t('glStudio.clipboardNoImage');
    case 'clipboardBlocked':
      return t('glStudio.clipboardBlocked');
  }
}
