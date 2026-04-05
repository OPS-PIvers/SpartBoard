import { useEffect } from 'react';

type BroadcastPayload = {
  sourceId: string;
  sourceType: string;
  dataType: string;
  data: unknown;
};

type ReceiverCallback = (payload: BroadcastPayload) => void;

class EventBus {
  private listeners: Record<string, Set<ReceiverCallback>> = {};

  subscribe(event: string, callback: ReceiverCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(callback);
    return () => this.listeners[event].delete(callback);
  }

  publish(event: string, payload: BroadcastPayload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(payload));
    }
  }
}

export const widgetEventBus = new EventBus();

export const useDataBroadcaster = (
  event: string,
  payload: BroadcastPayload
) => {
  // Extract data so we can rely on it as a dependency, and the rest of the payload properties
  // using JSON stringify so we don't have object reference issues without suppressing the lint warning.
  const { data, sourceId, sourceType, dataType } = payload;
  const meta = JSON.stringify({ sourceId, sourceType, dataType });

  useEffect(() => {
    const metaObj = JSON.parse(meta) as {
      sourceId: string;
      sourceType: string;
      dataType: string;
    };
    widgetEventBus.publish(event, { ...metaObj, data });
  }, [event, data, meta]);
};

export const useDataReceiver = (event: string, callback: ReceiverCallback) => {
  useEffect(() => {
    const unsubscribe = widgetEventBus.subscribe(event, callback);
    return () => {
      unsubscribe();
    };
  }, [event, callback]);
};
