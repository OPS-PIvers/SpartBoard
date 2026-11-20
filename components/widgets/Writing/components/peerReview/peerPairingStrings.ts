// Writing peer review setup wording, listed for review.
import type { WritingPeerAccess } from '@/types';

/** Teacher-facing wording, listed for review. */
export const PEER_PAIRING_STRINGS = {
  title: 'Peer review',
  access: 'Partners can',
  accessOptions: {
    view: 'View only',
    comment: 'Comment only',
    edit: 'Edit',
  } satisfies Record<WritingPeerAccess, string>,
  pairAll: 'Pair everyone at random',
  pairRest: 'Pair the rest at random',
  clear: 'Clear pairs',
  partner: 'Partner',
  notPaired: 'Not paired',
  reads: (name: string) => `Reads ${name}`,
  counts: (groups: number, left: number) =>
    `${groups} ${groups === 1 ? 'group' : 'groups'}. ${left} not paired.`,
  noStudents: 'No students to pair yet.',
  start: 'Start peer review',
  save: 'Save',
  end: 'End peer review',
  cancel: 'Cancel',
  failed: "Couldn't save peer review. Try again.",
} as const;
