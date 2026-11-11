// Older cards for the same quiz or rubric grey out when a newer card shows it (no host API unmounts them).

export interface Announcement {
  key: string;
  /** Saved time of the item, so an edit beats a reload of an older card. */
  version: number;
  mountedAt: number;
  instance: string;
}

const CHANNEL = 'spartboard-preview-supersede';

/** Newer saved version wins, then the later card, then instance id, so two cards never both stay live. */
export function isNewer(a: Announcement, b: Announcement): boolean {
  if (a.version !== b.version) return a.version > b.version;
  if (a.mountedAt !== b.mountedAt) return a.mountedAt > b.mountedAt;
  return a.instance > b.instance;
}

export function createSupersession(onSuperseded: () => void): {
  announce: (key: string, version: number) => void;
} {
  const instance = Math.random().toString(36).slice(2);
  const mountedAt = Date.now();
  let mine: Announcement | null = null;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return { announce: () => undefined };
  }
  channel.onmessage = (e: MessageEvent<Announcement>) => {
    const other = e.data;
    if (!mine || other?.key !== mine.key || other.instance === instance) return;
    if (isNewer(other, mine)) onSuperseded();
    else channel.postMessage(mine);
  };
  return {
    announce: (key, version) => {
      mine = { key, version, mountedAt, instance };
      channel.postMessage(mine);
    },
  };
}
