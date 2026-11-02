// Hand actions widgets report to the Connections runner; only real teacher input reports, never a Run's own writes.
import type { ConnectionHandAction } from '@/config/widgetConnections';

type Listener = (widgetId: string, hand: ConnectionHandAction) => void;

const listeners = new Set<Listener>();

export const reportHandAction = (
  widgetId: string,
  hand: ConnectionHandAction
): void => {
  listeners.forEach((l) => l(widgetId, hand));
};

export const onHandAction = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// One id per page load: two tabs on one computer are two devices.
export const CONNECTION_DEVICE_ID = crypto.randomUUID();
