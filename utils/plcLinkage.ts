/**
 * Shared builder for the `PlcLinkage` sub-object attached to an assignment
 * when the teacher opts into "Share results with <PLC>".
 *
 * Used by the QuizWidget assign flow, the Classroom add-on, the LTI picker
 * and the PLC page so every call site builds the same shape. Pooled results
 * never depend on a Google Sheet (docs/plans/PLC_ASSESSMENT_DATA.md D2), so
 * no sheet is created here; the Results screen offers the export on demand.
 */

import type { Plc, PlcLinkage } from '@/types';
import { getPlcMemberEmails } from '@/utils/plc';

/** Returns `undefined` when no PLC was chosen or the snapshot has no name yet. */
export function buildPlcLinkage(plc: Plc | undefined): PlcLinkage | undefined {
  if (!plc?.name) return undefined;
  return {
    id: plc.id,
    name: plc.name,
    memberEmails: getPlcMemberEmails(plc),
  };
}
