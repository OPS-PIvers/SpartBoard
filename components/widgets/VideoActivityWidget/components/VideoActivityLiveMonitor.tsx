// VideoActivityLiveMonitor — teacher view during a live video-activity assignment.
import type { VideoActivityResponse, VideoActivitySession } from '@/types';
import { VideoActivityMonitor } from './monitor/VideoActivityMonitor';

export interface VideoActivityLiveMonitorProps {
  session: VideoActivitySession;
  responses: VideoActivityResponse[];
  /**
   * "End assignment" — kills the student URL but preserves all responses.
   * Wired to `deactivateAssignment(assignmentId)`.
   */
  onEnd: () => Promise<void>;
  /** Pause this assignment — students see a paused screen. */
  onPause?: () => Promise<void>;
  /** Resume a paused assignment. */
  onResume?: () => Promise<void>;
  /**
   * Unlock a student's locked/auto-submitted attempt so they can resume.
   * Pass the response's `_responseKey`, not `studentUid`.
   */
  onUnlockStudent?: (sessionId: string, responseKey: string) => Promise<void>;
  /** Navigate back to the manager (In Progress tab) without ending. */
  onBack?: () => void;
  /** Opens the assignment's Settings dialog (When and the rule steps). */
  onEditSettings?: () => void;
}

export const VideoActivityLiveMonitor = VideoActivityMonitor;
