// Facilitators post a required task (T32); the template doc is copied into each workspace.

import React, { useId, useRef, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { INPUT, META } from '@/components/plc/redesignMockup/ui';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { postMentoringTask } from '@/hooks/useMentoring';
import type { MentoringSubmitter, MentoringWorkspace, Plc } from '@/types';
import { logError } from '@/utils/logError';
import { MENTORING_SUBMITTERS } from '@/utils/mentoring';
import { SUBMITTER_LABEL } from './mentoringFormat';

const LABEL = 'mb-1 block text-xs font-semibold text-slate-600';

export const PostTaskModal: React.FC<{
  plc: Plc;
  workspaces: readonly MentoringWorkspace[];
  onClose: () => void;
  onPosted?: (taskId: string) => void;
}> = ({ plc, workspaces, onClose, onPosted }) => {
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const id = useId();
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitter, setSubmitter] = useState<MentoringSubmitter>('mentee');
  const [templateUrl, setTemplateUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  const url = templateUrl.trim();
  const urlOk = !url || /^https:\/\/docs\.google\.com\//.test(url);
  const canPost = !!title.trim() && !!dueDate && urlOk && !!user;

  const post = async () => {
    if (!canPost || !user || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const taskId = await postMentoringTask(
        plc,
        {
          title: title.trim(),
          instructions: instructions.trim(),
          dueDate,
          submitter,
          templateDoc: url ? { title: title.trim(), url } : null,
        },
        user.uid,
        workspaces,
        driveService
      );
      onPosted?.(taskId);
      onClose();
    } catch (err) {
      logError('PostTaskModal.post', err, { plcId: plc.id });
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Post a task"
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          {failed && (
            <span className="mr-auto text-xs text-brand-red-primary">
              Couldn&apos;t save that change. Try again.
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void post()} disabled={!canPost || busy}>
            Post
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={`${id}-title`} className={LABEL}>
            Title
          </label>
          <input
            id={`${id}-title`}
            className={`${INPUT} w-full`}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-instructions`} className={LABEL}>
            Instructions
          </label>
          <textarea
            id={`${id}-instructions`}
            className={`${INPUT} w-full`}
            rows={4}
            maxLength={5000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-due`} className={LABEL}>
              Due date
            </label>
            <input
              id={`${id}-due`}
              type="date"
              className={`${INPUT} w-full`}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${id}-who`} className={LABEL}>
              Submits
            </label>
            <select
              id={`${id}-who`}
              className={`${INPUT} w-full`}
              value={submitter}
              onChange={(e) =>
                setSubmitter(e.target.value as MentoringSubmitter)
              }
            >
              {MENTORING_SUBMITTERS.map((s) => (
                <option key={s} value={s}>
                  {SUBMITTER_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-template`} className={LABEL}>
            Template doc
          </label>
          <input
            id={`${id}-template`}
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/document/d/…"
            className={`${INPUT} w-full`}
            value={templateUrl}
            onChange={(e) => setTemplateUrl(e.target.value)}
            aria-invalid={!urlOk}
          />
          {!urlOk && (
            <p className={`${META} mt-1`}>
              Not a Google Doc link. It may not embed.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
