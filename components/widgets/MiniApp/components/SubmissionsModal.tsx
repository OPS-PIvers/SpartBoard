/**
 * SubmissionsModal — teacher's view of student submissions for a single
 * MiniApp assignment session.
 *
 * Reads `mini_app_sessions/{sessionId}/submissions/*` in real time. Submission
 * doc IDs are opaque — either an opaque per-assignment pseudonym (studentRole
 * launches) or an anonymous Firebase Auth UID (legacy shared-link launches).
 * No PII is persisted; the payload is arbitrary JSON forwarded from the
 * sandboxed mini-app iframe's postMessage.
 *
 * When the session was class-targeted (`classId` present), we call
 * `getPseudonymsForAssignmentV1` to build a pseudonym -> name reverse map
 * in teacher-browser memory so grading shows real names. Unmatched doc IDs
 * (legacy shared-link launches) fall back to the opaque id.
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { X, Loader2, Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '@/config/firebase';
import {
  useAssignmentPseudonyms,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';

interface SubmissionRow {
  id: string;
  submittedAt: number;
  payload: unknown;
}

interface SubmissionsModalProps {
  sessionId: string;
  assignmentName: string;
  classId?: string;
  onClose: () => void;
}

export const SubmissionsModal: React.FC<SubmissionsModalProps> = ({
  sessionId,
  assignmentName,
  classId,
  onClose,
}) => {
  const { byAssignmentPseudonym } = useAssignmentPseudonyms(
    sessionId,
    classId ?? null
  );
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'mini_app_sessions', sessionId, 'submissions'),
      orderBy('submittedAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSubmissions(
          snap.docs.map((d) => {
            const data = d.data() as Partial<SubmissionRow>;
            return {
              id: d.id,
              submittedAt:
                typeof data.submittedAt === 'number' ? data.submittedAt : 0,
              payload: data.payload,
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        // FirestoreError carries a structured `code` (permission-denied,
        // unavailable, etc.) — more diagnostic than .message under minified
        // builds, and does not leak PII.
        const code =
          err &&
          typeof err === 'object' &&
          'code' in err &&
          typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'unknown';
        console.error('[SubmissionsModal] Failed to load submissions:', code);
        setError('Could not load submissions.');
        setLoading(false);
      }
    );
    return unsub;
  }, [sessionId]);

  return (
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white min-w-0">
            <Inbox className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-black uppercase tracking-tight">Submissions</p>
              <p className="text-white/80 text-xs truncate">{assignmentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close submissions"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-3">
          {error && (
            <p className="text-sm text-brand-red-primary font-medium">
              {error}
            </p>
          )}

          {loading ? (
            <div className="py-10 flex items-center justify-center text-brand-blue-primary">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <p className="font-bold text-slate-700">No submissions yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Submissions appear here as students finish the activity.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {submissions.length}{' '}
                {submissions.length === 1 ? 'submission' : 'submissions'}
              </p>
              {submissions.map((s) => (
                <SubmissionRowView
                  key={s.id}
                  submission={s}
                  studentName={formatStudentName(
                    byAssignmentPseudonym.get(s.id)
                  )}
                  expanded={expandedId === s.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === s.id ? null : s.id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SubmissionRowView: React.FC<{
  submission: SubmissionRow;
  studentName: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ submission, studentName, expanded, onToggle }) => {
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 text-left"
      >
        <Chevron className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="min-w-0 flex-1">
          {studentName ? (
            <>
              <p className="text-sm font-bold text-slate-800 truncate">
                {studentName}
              </p>
              <p className="font-mono text-[10px] text-slate-400 truncate">
                {submission.id}
              </p>
            </>
          ) : (
            <p className="font-mono text-xs text-slate-600 truncate">
              {submission.id}
            </p>
          )}
          <p className="text-xs text-slate-400">
            {submission.submittedAt > 0
              ? new Date(submission.submittedAt).toLocaleString()
              : 'Unknown time'}
          </p>
        </div>
      </button>
      {expanded && (
        <pre className="mt-2 rounded-xl bg-slate-900 text-slate-100 text-xs p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {formatPayload(submission.payload)}
        </pre>
      )}
    </div>
  );
};

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
