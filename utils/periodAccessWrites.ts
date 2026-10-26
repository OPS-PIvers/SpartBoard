// Firestore writes for `periodAccess` rows by FieldPath, since row keys are raw class ids.
import {
  deleteField,
  FieldPath,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore';
import type { PeriodAccess } from '@/types';
import type { PeriodAccessWindowEdits } from '@/utils/assignAvailability';

/** FieldPath writes for `periodAccess` rows (null deletes) and window edits; keys may hold dots. */
export const periodAccessWrites = (
  rows: Record<string, PeriodAccess | null> | undefined,
  edits?: PeriodAccessWindowEdits
): Array<[FieldPath, unknown]> => [
  ...Object.entries(rows ?? {}).map(([key, row]): [FieldPath, unknown] => [
    new FieldPath('periodAccess', key),
    row ?? deleteField(),
  ]),
  ...Object.entries(edits ?? {}).flatMap(([key, edit]) =>
    Object.entries(edit).map(([field, value]): [FieldPath, unknown] => [
      new FieldPath('periodAccess', key, field),
      value ?? null,
    ])
  ),
];

/** One batch update combining a plain patch with FieldPath writes. */
export const batchUpdateWithPaths = (
  batch: WriteBatch,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  paths: Array<[FieldPath, unknown]>
): void => {
  if (paths.length === 0) {
    batch.update(ref, patch);
    return;
  }
  const [first, ...rest] = [
    ...Object.entries(patch).map(([k, v]): [string | FieldPath, unknown] => [
      k,
      v,
    ]),
    ...paths,
  ];
  batch.update(ref, first[0], first[1], ...rest.flat());
};
