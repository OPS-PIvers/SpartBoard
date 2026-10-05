import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import type { Plc, PlcActionItem, PlcNote } from '@/types';
import { getPlcMembers } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { buildNoteGoogleDocHtml } from '@/components/plc/notes/noteGoogleDocHtml';

export interface PlcNoteGoogleDocContent {
  title: string;
  body: string;
  actionItems: PlcActionItem[];
}

const DRIVE_FOLDER = 'Group Notes';

const noteDocRef = (plcId: string, noteId: string) =>
  doc(db, 'plcs', plcId, 'noteDocs', noteId);

const readUrl = async (plcId: string, noteId: string) => {
  const snap = await getDoc(noteDocRef(plcId, noteId));
  const url: unknown = snap.exists() ? snap.data().url : null;
  return typeof url === 'string' ? url : null;
};

// A note's Google Doc is made once; every later click opens that same doc.
export const usePlcNoteGoogleDoc = (plc: Plc) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { driveService } = useGoogleDrive();
  const [creatingNoteId, setCreatingNoteId] = useState<string | null>(null);

  const getOrCreateDocUrl = async (
    note: PlcNote,
    content: PlcNoteGoogleDocContent
  ): Promise<string> => {
    const existing = await readUrl(plc.id, note.id);
    if (existing) return existing;
    if (!user) throw new Error('Not signed in');
    if (!driveService) throw new Error('Google Drive is not connected');

    setCreatingNoteId(note.id);
    try {
      const members = getPlcMembers(plc);
      const title =
        content.title.trim() ||
        t('plcDashboard.notes.untitled', { defaultValue: 'Untitled' });
      const html = buildNoteGoogleDocHtml({
        title,
        subtitle: [
          plc.name,
          new Date(note.createdAt || Date.now()).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        ]
          .filter(Boolean)
          .join(' · '),
        body: content.body,
        actionItems: content.actionItems,
        members,
        labels: {
          actionItems: t('plcDashboard.notes.meeting.actionItems', {
            defaultValue: 'Action items',
          }),
          due: (date) =>
            t('plcDashboard.notes.googleDoc.due', {
              defaultValue: 'due {{date}}',
              date,
            }),
        },
      });
      const file = await driveService.createGoogleDocFromHtml(
        title,
        html,
        DRIVE_FOLDER
      );
      const myEmail = user.email?.toLowerCase() ?? '';
      const shares = await Promise.allSettled(
        members
          .map((m) => m.email)
          .filter((email) => email && email !== myEmail)
          .map((email) => driveService.addEditorPermission(file.id, email))
      );
      shares.forEach((r) => {
        if (r.status === 'rejected') {
          logError('usePlcNoteGoogleDoc.share', r.reason, { plcId: plc.id });
        }
      });

      try {
        await setDoc(noteDocRef(plc.id, note.id), {
          fileId: file.id,
          url: file.webViewLink,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
        return file.webViewLink;
      } catch (err) {
        // A teammate made the doc first: open theirs and drop ours.
        const winner = await readUrl(plc.id, note.id).catch(() => null);
        if (!winner) throw err;
        void driveService.trashFile(file.id).catch((trashErr: unknown) =>
          logError('usePlcNoteGoogleDoc.trashDuplicate', trashErr, {
            plcId: plc.id,
          })
        );
        return winner;
      }
    } finally {
      setCreatingNoteId(null);
    }
  };

  return { creatingNoteId, getOrCreateDocUrl };
};
