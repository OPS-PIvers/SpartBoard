// Writing peer review wording on the student page and in the teacher's grader.
import type { WritingPeerMark } from '@/types';
import { editParts } from '@/utils/writingPeerText';

/** Student-facing wording, listed for review. */
export const PEER_STUDENT_STRINGS = {
  tabsLabel: 'Peer review',
  myWriting: 'My writing',
  review: (name: string) => `Review ${name}`,
  canView: 'You can read this writing.',
  canComment: 'Select text to comment on it.',
  canEdit: 'Select text to comment or suggest an edit.',
  comment: 'Comment',
  suggest: 'Suggest edit',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  commented: (name: string) => `${name} commented`,
  suggested: (name: string) => `${name} suggested an edit`,
  replace: (from: string, to: string) => `Change "${from}" to "${to}"`,
  remove: (from: string) => `Delete "${from}"`,
  add: (to: string) => `Add "${to}"`,
  accept: 'Accept',
  reject: 'Reject',
  done: 'Done',
  fromPartner: 'From your partner',
  noNotes: 'No comments yet.',
  you: 'You',
  yourNotes: 'Your comments',
  notStarted: "Your partner hasn't started writing yet.",
  loadFailed: "Couldn't load your partner's writing. It tries again soon.",
  saveFailed: "Couldn't save this. Try again.",
  textChanged: 'That text has changed. Make the edit yourself, or reject it.',
  partnerNotes: 'Partner comments',
  status: {
    open: 'Open',
    accepted: 'Accepted',
    rejected: 'Rejected',
    resolved: 'Done',
  } satisfies Record<WritingPeerMark['status'], string>,
} as const;

const S = PEER_STUDENT_STRINGS;

const short = (raw: string) => {
  const t = raw.trim();
  return t.length > 40 ? `${t.slice(0, 38)}...` : t;
};

export const editLabel = (m: WritingPeerMark): string => {
  const p = editParts(m.quote, m.insert ?? '');
  if (!p.removed.trim()) return S.add(short(p.added));
  if (!p.added.trim()) return S.remove(short(p.removed));
  return S.replace(short(p.removed), short(p.added));
};
