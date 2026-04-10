/**
 * Shared registry of widget DOM refs — all DraggableWindow instances register here
 * so group drag/resize can manipulate sibling widgets' DOM elements directly.
 */
export const widgetRefRegistry = new Map<string, HTMLDivElement>();
