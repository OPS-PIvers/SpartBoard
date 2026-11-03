// Hand actions widgets report to the Connections runner; only real teacher input reports, never a Run's own writes.
import type { ConnectionHandAction } from '@/config/widgetConnections';
import type { WidgetConnection } from '@/types';

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

export type RunCommand = 'start' | 'stop' | 'next';
type CommandListener = (
  connectionId: string,
  command: RunCommand,
  savedConnections?: WidgetConnection[]
) => void;
const commandListeners = new Set<CommandListener>();

/** Start, stop or move on a Sequence's Run from the step badge; this device carries it out. */
export const sendRunCommand = (
  connectionId: string,
  command: RunCommand,
  savedConnections?: WidgetConnection[]
): void => {
  commandListeners.forEach((l) => l(connectionId, command, savedConnections));
};

export const onRunCommand = (listener: CommandListener): (() => void) => {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
};

// One id per page load: two tabs on one computer are two devices.
export const CONNECTION_DEVICE_ID = crypto.randomUUID();
