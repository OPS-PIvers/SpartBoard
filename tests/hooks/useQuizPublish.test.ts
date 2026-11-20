import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useQuizPublish } from '@/hooks/useQuizPublish';
import { requestClassroomFinalGradeToken } from '@/components/classroomAddon/gisOAuth';
import { loadFinalScoreOverlay } from '@/hooks/gradebook/useFinalScoreOverlay';
import { runPublishGradePush } from '@/utils/publishGradePush';
import { runBulkPublish } from '@/components/common/library/assigned/bulkPublish';
import { logError } from '@/utils/logError';
import type {
  ClassroomAttachmentLink,
  QuizAssignment,
  QuizData,
  QuizMetadata,
  QuizResponse,
  ResultsProtection,
} from '@/types';

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/functions')>()),
  httpsCallable: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __db: true },
  functions: { __functions: true },
  auth: {},
  storage: {},
  isAuthBypass: false,
  isConfigured: true,
}));

vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  requestClassroomFinalGradeToken: vi.fn(),
}));

vi.mock('@/hooks/gradebook/useFinalScoreOverlay', () => ({
  loadFinalScoreOverlay: vi.fn(),
}));

vi.mock('@/utils/publishGradePush', () => ({
  runPublishGradePush: vi.fn(),
}));

vi.mock('@/components/common/library/assigned/bulkPublish', () => ({
  runBulkPublish: vi.fn(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockDoc = doc as Mock;
const mockGetDoc = getDoc as Mock;
const mockHttpsCallable = httpsCallable as Mock;
const mockToken = requestClassroomFinalGradeToken as Mock;
const mockOverlay = loadFinalScoreOverlay as Mock;
const mockGradePush = runPublishGradePush as Mock;
const mockBulk = runBulkPublish as Mock;
const mockLogError = logError as Mock;

type Args = Parameters<typeof useQuizPublish>[0];
type BulkOpts = Parameters<typeof runBulkPublish<QuizAssignment>>[0];
type PushOpts = Parameters<typeof runPublishGradePush<QuizResponse>>[0];
const pushOpts = () => mockGradePush.mock.calls[0][0] as PushOpts;

const assignment = (over: Partial<QuizAssignment> = {}): QuizAssignment =>
  ({
    id: 'asg-1',
    quizId: 'quiz-1',
    quizTitle: 'Fractions',
    status: 'inactive',
    ...over,
  }) as QuizAssignment;

const ownedAttachment = {
  courseId: 'c1',
  ownsCourseWork: true,
  maxPoints: 10,
} as unknown as ClassroomAttachmentLink;

const quizMeta = { id: 'quiz-1', driveFileId: 'drive-1' } as QuizMetadata;
const quizData = {
  id: 'quiz-1',
  questions: [{ id: 'q1', type: 'MC', points: 2 }],
} as unknown as QuizData;
const protection = { watermark: true } as unknown as ResultsProtection;

describe('useQuizPublish', () => {
  const calls: string[] = [];
  const addToast = vi.fn((msg: string, type?: string) => {
    calls.push(`toast:${type}:${msg}`);
  });
  const publishAssignmentScores = vi.fn<Args['publishAssignmentScores']>();
  const unpublishAssignmentScores = vi.fn<Args['unpublishAssignmentScores']>();
  const deactivateAssignment = vi.fn<Args['deactivateAssignment']>();
  const loadAnswerKeyQuizQuietly = vi.fn<Args['loadAnswerKeyQuizQuietly']>();
  const updateAppSettings = vi.fn<Args['updateAppSettings']>();
  const canAccessFeature = vi.fn<Args['canAccessFeature']>();
  const setPublishingAssignment = vi.fn<Args['setPublishingAssignment']>();
  const setBulkPublishing = vi.fn<Args['setBulkPublishing']>();

  const baseArgs = (over: Partial<Args> = {}): Args => ({
    user: { uid: 'teacher-1', email: 't@school.org' } as Args['user'],
    quizzes: [quizMeta],
    addToast,
    canAccessFeature,
    canAssignToClassroom: false,
    paperSheets: { enabled: false },
    updateAppSettings,
    loadAnswerKeyQuizQuietly,
    deactivateAssignment,
    publishAssignmentScores,
    unpublishAssignmentScores,
    publishingAssignment: null,
    setPublishingAssignment,
    bulkPublishing: null,
    setBulkPublishing,
    publishEndsAssignment: false,
    ...over,
  });

  const render = (over: Partial<Args> = {}) =>
    renderHook(() => useQuizPublish(baseArgs(over))).result.current;

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    mockDoc.mockImplementation((_db: unknown, col: string, id: string) => ({
      path: `${col}/${id}`,
    }));
    mockGetDoc.mockResolvedValue({ data: () => undefined });
    mockOverlay.mockResolvedValue(null);
    mockGradePush.mockResolvedValue(undefined);
    loadAnswerKeyQuizQuietly.mockResolvedValue(quizData);
    publishAssignmentScores.mockImplementation(() => {
      calls.push('publishAssignmentScores');
      return Promise.resolve({ responsesUpdated: 2, paperResponses: 0 });
    });
    unpublishAssignmentScores.mockImplementation((id) => {
      calls.push(`unpublish:${id}`);
      return Promise.resolve();
    });
    deactivateAssignment.mockImplementation((id) => {
      calls.push(`deactivate:${id}`);
      return Promise.resolve();
    });
    updateAppSettings.mockResolvedValue(undefined);
    canAccessFeature.mockReturnValue(false);
  });

  describe('publishTargets / closePublish', () => {
    it('targets the single assignment over the bulk list', () => {
      const one = assignment();
      const r = render({
        publishingAssignment: one,
        bulkPublishing: [assignment({ id: 'b' })],
      });
      expect(r.publishTargets).toEqual([one]);
    });

    it('falls back to the bulk list, then to none', () => {
      const bulk = [assignment({ id: 'a' }), assignment({ id: 'b' })];
      expect(render({ bulkPublishing: bulk }).publishTargets).toEqual(bulk);
      expect(render().publishTargets).toEqual([]);
    });

    it('closePublish clears both targets', () => {
      render().closePublish();
      expect(setPublishingAssignment).toHaveBeenCalledWith(null);
      expect(setBulkPublishing).toHaveBeenCalledWith(null);
    });
  });

  describe('publishQuizScoresFor', () => {
    it('unpublishes when visibility is none, toasting unless quiet', async () => {
      const r = render();
      await expect(
        r.publishQuizScoresFor(assignment(), 'none', undefined, undefined, {
          quiet: false,
        })
      ).resolves.toBe(true);
      expect(calls).toEqual([
        'unpublish:asg-1',
        'toast:success:Scores unpublished.',
      ]);
      calls.length = 0;
      await r.publishQuizScoresFor(assignment(), 'none', undefined, undefined, {
        quiet: true,
      });
      expect(calls).toEqual(['unpublish:asg-1']);
      expect(publishAssignmentScores).not.toHaveBeenCalled();
    });

    it('throws when the quiz left the library', async () => {
      const r = render({ quizzes: [] });
      await expect(
        r.publishQuizScoresFor(
          assignment(),
          'score-only',
          undefined,
          undefined,
          { quiet: false }
        )
      ).rejects.toThrow(
        'Quiz is no longer in your library — cannot publish scores.'
      );
    });

    it('returns false without publishing when the answer key did not load', async () => {
      loadAnswerKeyQuizQuietly.mockResolvedValue(null);
      const target = assignment();
      const r = render();
      await expect(
        r.publishQuizScoresFor(target, 'score-only', undefined, undefined, {
          quiet: false,
        })
      ).resolves.toBe(false);
      expect(loadAnswerKeyQuizQuietly).toHaveBeenCalledWith(quizMeta, target);
      expect(publishAssignmentScores).not.toHaveBeenCalled();
      expect(addToast).not.toHaveBeenCalled();
    });

    it('publishes with every argument and toasts the student count', async () => {
      const r = render();
      await r.publishQuizScoresFor(
        assignment(),
        'score-only',
        protection,
        'typed',
        { quiet: false }
      );
      expect(publishAssignmentScores).toHaveBeenCalledWith(
        'asg-1',
        quizData,
        'score-only',
        protection,
        'typed'
      );
      expect(addToast).toHaveBeenCalledWith(
        'Scores published to 2 students.',
        'success'
      );
    });

    it('uses the singular for one student', async () => {
      publishAssignmentScores.mockResolvedValue({
        responsesUpdated: 1,
        paperResponses: 0,
      });
      await render().publishQuizScoresFor(
        assignment(),
        'score-only',
        undefined,
        undefined,
        { quiet: false }
      );
      expect(addToast).toHaveBeenCalledWith(
        'Scores published to 1 student.',
        'success'
      );
    });

    it('says students will see results later when nobody has submitted', async () => {
      publishAssignmentScores.mockResolvedValue({
        responsesUpdated: 0,
        paperResponses: 0,
      });
      await render().publishQuizScoresFor(
        assignment(),
        'score-only',
        undefined,
        undefined,
        { quiet: false }
      );
      expect(addToast).toHaveBeenCalledWith(
        'Scores published. Students will see results once they submit.',
        'success'
      );
    });

    it('stays quiet and routes toasts to the given toast', async () => {
      const toast = vi.fn();
      await render().publishQuizScoresFor(
        assignment(),
        'score-only',
        undefined,
        undefined,
        { quiet: true, toast }
      );
      expect(toast).not.toHaveBeenCalled();
      expect(addToast).not.toHaveBeenCalled();
      expect(pushOpts().addToast).toBe(toast);
    });

    it('ends a live assignment before publishing when asked', async () => {
      await render().publishQuizScoresFor(
        assignment({ status: 'active' }),
        'score-only',
        undefined,
        undefined,
        { quiet: true, endsAssignment: true }
      );
      expect(calls).toEqual(['deactivate:asg-1', 'publishAssignmentScores']);
    });

    it('does not end an already-closed assignment', async () => {
      await render().publishQuizScoresFor(
        assignment({ status: 'inactive' }),
        'score-only',
        undefined,
        undefined,
        { quiet: true, endsAssignment: true }
      );
      expect(deactivateAssignment).not.toHaveBeenCalled();
    });

    it('mints a Classroom token for an owned attachment and hands it to the grade push', async () => {
      mockToken.mockResolvedValue('gc-token');
      const target = assignment({ classroomAttachments: [ownedAttachment] });
      await render({ canAssignToClassroom: true }).publishQuizScoresFor(
        target,
        'score-only',
        undefined,
        undefined,
        { quiet: true }
      );
      expect(mockToken).toHaveBeenCalledWith('t@school.org');
      const opts = pushOpts();
      expect(opts.classroomToken).toBe('gc-token');
      expect(opts.classroomFinalAttachments).toEqual([ownedAttachment]);
      expect(opts.kind).toBe('quiz');
      expect(opts.sessionId).toBe('asg-1');
      expect(opts.schoologyMaxPoints).toBe(2);
      expect(opts.buildClassroomGrades([])).toEqual([]);
      expect(opts.buildSchoologyGrades([])).toEqual([]);
    });

    it('publishes with a null token when the Classroom popup fails', async () => {
      mockToken.mockRejectedValue(new Error('popup closed'));
      await render({ canAssignToClassroom: true }).publishQuizScoresFor(
        assignment({ classroomAttachments: [ownedAttachment] }),
        'score-only',
        undefined,
        undefined,
        { quiet: true }
      );
      expect(publishAssignmentScores).toHaveBeenCalled();
      expect(pushOpts().classroomToken).toBeNull();
    });

    it('reuses a supplied token and skips Classroom when not allowed', async () => {
      await render({ canAssignToClassroom: true }).publishQuizScoresFor(
        assignment({ classroomAttachments: [ownedAttachment] }),
        'score-only',
        undefined,
        undefined,
        { quiet: true, token: 'shared' }
      );
      expect(mockToken).not.toHaveBeenCalled();
      expect(pushOpts().classroomToken).toBe('shared');
      vi.clearAllMocks();
      mockGradePush.mockResolvedValue(undefined);
      loadAnswerKeyQuizQuietly.mockResolvedValue(quizData);
      publishAssignmentScores.mockResolvedValue({
        responsesUpdated: 0,
        paperResponses: 0,
      });
      await render().publishQuizScoresFor(
        assignment({ classroomAttachments: [ownedAttachment] }),
        'score-only',
        undefined,
        undefined,
        { quiet: true }
      );
      expect(mockToken).not.toHaveBeenCalled();
      expect(pushOpts().classroomFinalAttachments).toEqual([]);
    });

    it('reads the session for the grade push and the final-score overlay', async () => {
      canAccessFeature.mockReturnValue(true);
      await render().publishQuizScoresFor(
        assignment(),
        'score-only',
        undefined,
        undefined,
        { quiet: true }
      );
      expect(mockDoc).toHaveBeenCalledWith(
        { __db: true },
        'quiz_sessions',
        'asg-1'
      );
      expect(canAccessFeature).toHaveBeenCalledWith('gradebook');
      expect(mockOverlay).toHaveBeenCalledWith(
        {
          kind: 'quiz',
          sessionId: 'asg-1',
          teacherUid: 'teacher-1',
          uid: 'teacher-1',
        },
        true
      );
    });

    it('still pushes grades when the session read fails', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));
      await expect(
        render().publishQuizScoresFor(
          assignment(),
          'score-only',
          undefined,
          undefined,
          { quiet: true }
        )
      ).resolves.toBe(true);
      expect(mockGradePush).toHaveBeenCalled();
    });

    describe('paper results', () => {
      const link = vi.fn();
      beforeEach(() => {
        mockHttpsCallable.mockReturnValue(link);
      });

      it('skips the link when paper sheets are off', async () => {
        await render().publishQuizScoresFor(
          assignment({ hasPaperResponses: true }),
          'score-only',
          undefined,
          undefined,
          { quiet: true }
        );
        expect(mockHttpsCallable).not.toHaveBeenCalled();
      });

      it('links paper results and reports the unlinked and unplaced (plural)', async () => {
        link.mockResolvedValue({
          data: { pointersWritten: 1, unlinked: 2, unplaced: 3 },
        });
        await render({ paperSheets: { enabled: true } }).publishQuizScoresFor(
          assignment({ hasPaperResponses: true }),
          'score-only',
          undefined,
          undefined,
          { quiet: true }
        );
        expect(mockHttpsCallable).toHaveBeenCalledWith(
          { __functions: true },
          'publishPaperResultsV1'
        );
        expect(link).toHaveBeenCalledWith({ assignmentId: 'asg-1' });
        expect(addToast.mock.calls).toEqual([
          [
            '2 paper responses have no student login to link to; those students can see results only from your view.',
            'info',
          ],
          [
            '3 paper responses belong to a student whose roster has no class link yet; sync the roster and publish again to reach them.',
            'info',
          ],
        ]);
      });

      it('uses the singular and runs when the grading pass found paper rows', async () => {
        publishAssignmentScores.mockResolvedValue({
          responsesUpdated: 0,
          paperResponses: 1,
        });
        link.mockResolvedValue({
          data: { pointersWritten: 0, unlinked: 1, unplaced: 1 },
        });
        await render({ paperSheets: { enabled: true } }).publishQuizScoresFor(
          assignment(),
          'score-only',
          undefined,
          undefined,
          { quiet: true }
        );
        expect(addToast.mock.calls).toEqual([
          [
            '1 paper response has no student login to link to; those students can see results only from your view.',
            'info',
          ],
          [
            '1 paper response belongs to a student whose roster has no class link yet; sync the roster and publish again to reach them.',
            'info',
          ],
        ]);
      });

      it('says nothing when every paper response linked', async () => {
        link.mockResolvedValue({
          data: { pointersWritten: 4, unlinked: 0, unplaced: 0 },
        });
        await render({ paperSheets: { enabled: true } }).publishQuizScoresFor(
          assignment({ hasPaperResponses: true }),
          'score-only',
          undefined,
          undefined,
          { quiet: true }
        );
        expect(addToast).not.toHaveBeenCalled();
      });

      it('logs and toasts when the link fails, then still pushes grades', async () => {
        const err = new Error('callable down');
        link.mockRejectedValue(err);
        await expect(
          render({ paperSheets: { enabled: true } }).publishQuizScoresFor(
            assignment({ hasPaperResponses: true }),
            'score-only',
            undefined,
            undefined,
            { quiet: true }
          )
        ).resolves.toBe(true);
        expect(mockLogError).toHaveBeenCalledWith(
          'QuizWidget.publishPaperResults',
          err,
          { assignmentId: 'asg-1' }
        );
        expect(addToast).toHaveBeenCalledWith(
          'Scores published, but paper results could not be linked to student accounts.',
          'error'
        );
        expect(mockGradePush).toHaveBeenCalled();
      });
    });
  });

  describe('saveLastProtection', () => {
    it('saves the choice', async () => {
      await render().saveLastProtection(protection);
      expect(updateAppSettings).toHaveBeenCalledWith({
        lastResultsProtection: protection,
      });
    });

    it('does nothing without a choice', async () => {
      await render().saveLastProtection(undefined);
      expect(updateAppSettings).not.toHaveBeenCalled();
    });

    it('logs a failed save without a toast', async () => {
      const err = new Error('denied');
      updateAppSettings.mockRejectedValue(err);
      await render().saveLastProtection(protection);
      expect(mockLogError).toHaveBeenCalledWith(
        'QuizWidget.updateAppSettings.lastProtection',
        err
      );
      expect(addToast).not.toHaveBeenCalled();
    });
  });

  describe('onConfirmPublish (single)', () => {
    it('publishes, clears the target, then saves the protection choice', async () => {
      const target = assignment({ status: 'active' });
      updateAppSettings.mockImplementation(() => {
        calls.push('updateAppSettings');
        return Promise.resolve();
      });
      setPublishingAssignment.mockImplementation(() => {
        calls.push('clear');
      });
      await render({
        publishingAssignment: target,
        publishEndsAssignment: true,
      }).onConfirmPublish('score-only', protection, undefined);
      expect(calls).toEqual([
        'deactivate:asg-1',
        'publishAssignmentScores',
        'toast:success:Scores published to 2 students.',
        'clear',
        'updateAppSettings',
      ]);
      expect(setPublishingAssignment).toHaveBeenCalledWith(null);
      expect(mockBulk).not.toHaveBeenCalled();
    });

    it('keeps the dialog open when the answer key did not load', async () => {
      loadAnswerKeyQuizQuietly.mockResolvedValue(null);
      await render({ publishingAssignment: assignment() }).onConfirmPublish(
        'score-only',
        protection,
        undefined
      );
      expect(setPublishingAssignment).not.toHaveBeenCalled();
      expect(updateAppSettings).not.toHaveBeenCalled();
    });

    it('logs and toasts the error message on failure', async () => {
      const err = new Error('write denied');
      publishAssignmentScores.mockRejectedValue(err);
      await render({ publishingAssignment: assignment() }).onConfirmPublish(
        'score-only',
        protection,
        undefined
      );
      expect(mockLogError).toHaveBeenCalledWith(
        'QuizWidget.publishAssignmentScores',
        err,
        { assignmentId: 'asg-1', visibility: 'score-only' }
      );
      expect(addToast).toHaveBeenCalledWith('write denied', 'error');
      expect(setPublishingAssignment).not.toHaveBeenCalled();
      expect(updateAppSettings).not.toHaveBeenCalled();
    });

    it('toasts the missing-quiz message', async () => {
      await render({
        quizzes: [],
        publishingAssignment: assignment(),
      }).onConfirmPublish('score-only', undefined, undefined);
      expect(addToast).toHaveBeenCalledWith(
        'Quiz is no longer in your library — cannot publish scores.',
        'error'
      );
    });

    it('falls back to a generic message for a non-Error throw', async () => {
      publishAssignmentScores.mockRejectedValue('boom');
      await render({ publishingAssignment: assignment() }).onConfirmPublish(
        'score-only',
        undefined,
        undefined
      );
      expect(addToast).toHaveBeenCalledWith(
        'Failed to publish scores',
        'error'
      );
    });
  });

  describe('onConfirmPublish (bulk)', () => {
    const bulk = () => [
      assignment({ id: 'a' }),
      assignment({ id: 'b', hasPaperWritten: true }),
    ];

    it('runs one bulk publish, closes, and saves protection when any succeeded', async () => {
      mockBulk.mockResolvedValue(2);
      const targets = bulk();
      await render({ bulkPublishing: targets }).onConfirmPublish(
        'score-only',
        protection,
        'typed'
      );
      const opts = mockBulk.mock.calls[0][0] as BulkOpts;
      expect(opts.targets).toEqual(targets);
      expect(opts.unpublish).toBe(false);
      expect(opts.mintToken).toBeUndefined();
      expect(opts.addToast).toBe(addToast);
      expect(opts.logKey).toBe('QuizWidget.bulkPublishScores');
      expect(setPublishingAssignment).toHaveBeenCalledWith(null);
      expect(setBulkPublishing).toHaveBeenCalledWith(null);
      expect(updateAppSettings).toHaveBeenCalledWith({
        lastResultsProtection: protection,
      });
    });

    it('does not save protection when none succeeded', async () => {
      mockBulk.mockResolvedValue(0);
      await render({ bulkPublishing: bulk() }).onConfirmPublish(
        'score-only',
        protection,
        undefined
      );
      expect(setBulkPublishing).toHaveBeenCalledWith(null);
      expect(updateAppSettings).not.toHaveBeenCalled();
    });

    it('flags an unpublish', async () => {
      mockBulk.mockResolvedValue(1);
      await render({ bulkPublishing: bulk() }).onConfirmPublish(
        'none',
        undefined,
        undefined
      );
      expect((mockBulk.mock.calls[0][0] as BulkOpts).unpublish).toBe(true);
    });

    it('publishes each target quietly with the shared token, written mode only for paper', async () => {
      mockBulk.mockResolvedValue(2);
      const targets = bulk();
      await render({ bulkPublishing: targets }).onConfirmPublish(
        'score-only',
        protection,
        'typed'
      );
      const opts = mockBulk.mock.calls[0][0] as BulkOpts;
      const toast = vi.fn();
      await opts.publishOne(targets[0], 'tok', toast);
      await opts.publishOne(targets[1], 'tok', toast);
      expect(publishAssignmentScores.mock.calls).toEqual([
        ['a', quizData, 'score-only', protection, undefined],
        ['b', quizData, 'score-only', protection, 'typed'],
      ]);
      expect(toast).not.toHaveBeenCalled();
      expect(mockToken).not.toHaveBeenCalled();
      expect(pushOpts().classroomToken).toBe('tok');
    });

    it('offers a token minter only when a target has an owned Classroom attachment', async () => {
      mockBulk.mockResolvedValue(1);
      mockToken.mockResolvedValue('gc');
      await render({
        canAssignToClassroom: true,
        bulkPublishing: [
          assignment({ id: 'a' }),
          assignment({ id: 'b', classroomAttachments: [ownedAttachment] }),
        ],
      }).onConfirmPublish('score-only', undefined, undefined);
      const opts = mockBulk.mock.calls[0][0] as BulkOpts;
      await expect(opts.mintToken?.()).resolves.toBe('gc');
      expect(mockToken).toHaveBeenCalledWith('t@school.org');

      mockBulk.mockClear();
      await render({
        canAssignToClassroom: true,
        bulkPublishing: [assignment({ id: 'a' })],
      }).onConfirmPublish('score-only', undefined, undefined);
      expect((mockBulk.mock.calls[0][0] as BulkOpts).mintToken).toBeUndefined();
    });
  });

  describe('onUnpublishScores', () => {
    it('unpublishes and toasts', async () => {
      await render().onUnpublishScores(assignment());
      expect(calls).toEqual([
        'unpublish:asg-1',
        'toast:success:Scores unpublished.',
      ]);
    });

    it('toasts the error message on failure', async () => {
      unpublishAssignmentScores.mockRejectedValue(new Error('nope'));
      await render().onUnpublishScores(assignment());
      expect(addToast).toHaveBeenCalledWith('nope', 'error');
    });

    it('falls back to a generic message for a non-Error throw', async () => {
      unpublishAssignmentScores.mockRejectedValue('x');
      await render().onUnpublishScores(assignment());
      expect(addToast).toHaveBeenCalledWith(
        'Failed to unpublish scores',
        'error'
      );
    });
  });
});
