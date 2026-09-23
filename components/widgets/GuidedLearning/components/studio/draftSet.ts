import type { GuidedLearningSet } from '@/types';
import { GL_SET_SCHEMA_VERSION } from '../../utils/setMigration';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';

export type DraftFields = Pick<
  GuidedLearningEditorController,
  | 'title'
  | 'imageUrls'
  | 'imageKinds'
  | 'videoTrims'
  | 'steps'
  | 'mode'
  | 'hotspotPulse'
  | 'imageTransition'
  | 'watchPace'
  | 'spotlightRadiiV2'
>;

/** Stage-only view of the draft, as the player would receive it. */
export function draftSetForStage(
  state: DraftFields,
  setId: string
): GuidedLearningSet {
  return {
    id: setId,
    // Legacy radii stay legacy on the canvas until the load-time conversion runs.
    schemaVersion: state.spotlightRadiiV2 ? GL_SET_SCHEMA_VERSION : 1,
    title: state.title,
    imageUrls: state.imageUrls,
    imageKinds: state.imageKinds,
    videoTrims: state.videoTrims,
    steps: state.steps,
    mode: state.mode,
    hotspotPulse: state.hotspotPulse,
    imageTransition: state.imageTransition,
    watchPace: state.watchPace,
    createdAt: 0,
    updatedAt: 0,
  };
}
