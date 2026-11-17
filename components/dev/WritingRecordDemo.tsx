// `/writing-dev?record=…`: the Writing record on sample logs built with the real recorder.
import React from 'react';
import { WritingRecordView } from '@/components/common/WritingRecord';
import { Modal } from '@/components/common/Modal';
import { buildWritingRecordSample, SAMPLE_START } from './writingRecordSample';

export type RecordDemoId = 'teacher' | 'full' | 'purged' | 'student';

const SAMPLE = buildWritingRecordSample();
const FULL = buildWritingRecordSample(150);

const Frame: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="mx-auto my-8 max-w-2xl rounded-2xl bg-white p-6 shadow-lg">
    <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
    {children}
  </div>
);

export const WritingRecordDemo: React.FC<{ id: RecordDemoId }> = ({ id }) => {
  if (id === 'student')
    return (
      <div className="min-h-screen bg-slate-100">
        <Modal
          isOpen
          onClose={() => undefined}
          title="Your Writing record"
          maxWidth="max-w-2xl"
        >
          <WritingRecordView
            chunks={SAMPLE.chunks}
            facts={{ summary: SAMPLE.summary }}
          />
        </Modal>
      </div>
    );
  const sample = id === 'full' ? FULL : SAMPLE;
  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <Frame title="Writing record: Maya Okafor-Lindqvist">
        <WritingRecordView
          chunks={
            id === 'purged'
              ? sample.chunks.map((c) => ({
                  index: c.index,
                  log: c.log
                    .split(';')
                    .filter((tk) => tk[0] === 'P' || tk[0] === 'S')
                    .join(';'),
                }))
              : sample.chunks
          }
          facts={{
            summary:
              id === 'full'
                ? { ...sample.summary, logStoppedAt: sample.summary.savedAt }
                : sample.summary,
            ...(id === 'purged' ? { logPurgedAt: SAMPLE_START + 1 } : {}),
          }}
          drafts={sample.drafts}
        />
      </Frame>
    </div>
  );
};
