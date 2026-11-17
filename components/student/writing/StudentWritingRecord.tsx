// D11: the student's own Writing record, behind a button the teacher's switch shows.
import React, { useState } from 'react';
import { History } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  WritingRecord,
  type WritingRecordFacts,
} from '@/components/common/WritingRecord';

const STRINGS = {
  open: 'Writing record',
  title: 'Your Writing record',
} as const;

export const StudentWritingRecordButton: React.FC<{
  sessionId: string;
  studentUid: string;
  facts: WritingRecordFacts;
}> = ({ sessionId, studentUid, facts }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* no-tour-anchor: student page; live tours run in the teacher app */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-light"
      >
        <History aria-hidden="true" className="h-4 w-4" />
        {STRINGS.open}
      </button>
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title={STRINGS.title}
          maxWidth="max-w-2xl"
        >
          <WritingRecord
            sessionId={sessionId}
            studentUid={studentUid}
            facts={facts}
          />
        </Modal>
      )}
    </>
  );
};
