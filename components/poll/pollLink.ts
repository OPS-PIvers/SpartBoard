/**
 * Public-poll join-link codec. Mirrors the Activity Wall `?data=<base64>`
 * shape (`components/remote/controls/RemoteActivityWallControl.tsx` →
 * `encodeActivityData`, and `ActivityWallStudentApp.tsx` → `decodeBase64Utf8`)
 * so the participant app can render without a Firestore read of the poll
 * config. Centralised here (one module) rather than duplicated across the
 * widget, remote, and participant app the way Activity Wall duplicated its
 * encoder.
 */

export interface PollVotePayloadOption {
  id: string;
  label: string;
}

export interface PollVotePayload {
  /** The poll session id — the `:pollId` route segment. */
  id: string;
  question: string;
  options: PollVotePayloadOption[];
  /** Owning teacher uid; half of the `poll_sessions` doc key. */
  teacherUid: string;
}

const isPollVotePayload = (value: unknown): value is PollVotePayload => {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as {
    id?: unknown;
    question?: unknown;
    options?: unknown;
    teacherUid?: unknown;
  };
  return (
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.question === 'string' &&
    typeof p.teacherUid === 'string' &&
    p.teacherUid.length > 0 &&
    Array.isArray(p.options) &&
    p.options.every(
      (o) =>
        typeof o === 'object' &&
        o !== null &&
        typeof (o as { id?: unknown }).id === 'string' &&
        typeof (o as { label?: unknown }).label === 'string'
    )
  );
};

export const encodePollData = (payload: PollVotePayload): string => {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return encodeURIComponent(btoa(binary));
};

export const buildPublicPollLink = (payload: PollVotePayload): string => {
  const encoded = encodePollData(payload);
  return `${window.location.origin}/poll/${payload.id}?data=${encoded}`;
};

const decodeBase64Utf8 = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const binary = atob(decodeURIComponent(trimmed));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export const decodePollPayload = (): PollVotePayload | null => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('data');
  if (!encoded) return null;
  const json = decodeBase64Utf8(encoded);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isPollVotePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
