import type { ResponseArtifact } from '@/types';

/** Fixture builder for `ResponseArtifact`; shared by the rich-response suites. */
export function makeTestArtifact(
  overrides: Partial<ResponseArtifact> = {}
): ResponseArtifact {
  return {
    id: 'artifact-1',
    slot: 'primary',
    kind: 'audio',
    storagePath: 'quiz_response_media/sess-1/student-uid-1/artifact-1.webm',
    mimeType: 'audio/webm',
    bytes: 2048,
    durationMs: 4200,
    uploadState: 'uploaded',
    ...overrides,
  };
}
