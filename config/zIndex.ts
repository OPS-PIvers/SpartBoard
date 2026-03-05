/**
 * Centralized Z-Index Registry
 * Defines the vertical stacking order of the application.
 * Used in tailwind.config.js for utility classes and in components for inline styles.
 */

export const Z_INDEX = {
  // Base layers
  base: 0,
  decorator: 10,
  content: 20,
  controls: 30,

  // Widget internal layers
  stickerControl: 50, // Sticker controls (above sticker content)
  widgetResize: 60, // Resize handles (above widget content)
  widgetInternalOverlay: 60, // Overlays inside a widget (e.g. modals)
  dropdown: 110, // Local dropdowns within widgets (must be > widget base)

  // Widget layers
  widget: 100, // Standard widget level (DraggableWindow uses this as base + widget.z)
  widgetDrag: 500, // Widget being dragged
  maximized: 10500, // Maximized widget

  // System UI layers
  dock: 1000, // Dock bar
  dockDragging: 1100, // Dock item being dragged
  sidebar: 1200, // Sidebar
  header: 1300, // Top navigation/header

  // Overlay layers
  backdrop: 9900, // Dimmed backgrounds
  overlay: 9910, // Full-screen overlays (e.g. DrawingWidget)
  announcementOverlay: 9985, // Windowed announcements
  announcementMaximized: 9990, // Maximized announcements
  confirmOverlay: 9950, // Confirmation dialogs within widgets
  modal: 10000, // Standard Modals (e.g. Settings, Reports)
  modalContent: 10001, // Content within modals (dropdowns etc)
  modalNested: 10100, // Modals on top of modals (e.g. Drive Picker, Library)
  modalNestedContent: 10110, // Content within nested modals
  modalDeep: 10200, // Modals on top of nested modals (e.g. Routine Editor)
  modalDeepContent: 10210, // Content within deep modals

  // Floating/Pop-up layers
  popover: 11000, // Popovers, Menus attached to elements
  toolMenu: 12000, // DraggableWindow specific tool menu
  tooltip: 13000, // Tooltips
  toast: 14000, // Toast notifications

  // Critical layers
  critical: 20000, // Overlays that must block everything (e.g. Dock expanded, Critical Errors)
  cursor: 21000, // Custom cursors
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;
