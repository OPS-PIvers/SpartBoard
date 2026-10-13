export const TOUR_SURFACE_KINDS = [
  'board',
  'dock',
  'sidebar',
  'widget',
  'settings-drawer',
  'menu',
  'modal',
  'panel',
  'editor',
  'page',
  'shared',
] as const;

export type TourSurfaceKind = (typeof TOUR_SURFACE_KINDS)[number];

export const TOUR_SURFACE_NEEDS = [
  'widget-on-stage',
  'library-item',
  'class',
  'plc',
  'admin',
  'live-session',
  'student-data',
] as const;

/** What has to exist before a surface's opener does anything. */
export type TourSurfaceNeed = (typeof TOUR_SURFACE_NEEDS)[number];

export interface TourSurfaceDef {
  label: string;
  kind: TourSurfaceKind;
  /** Repo-relative files, or folders ending in `/`, whose anchors sit on this surface; the longest match wins. */
  files: readonly string[];
  /** Anchor ref whose click opens this surface; absent for the board, widget faces and pages. */
  opensWith?: string;
  /** The control that opens this surface when it has no anchor yet, for the anchor sweep to tag. */
  openerMissing?: string;
  /** Surface id `opensWith` is clicked on, when that anchor renders on more than one surface. */
  parent?: string;
  needs?: readonly TourSurfaceNeed[];
  /** The widget whose face or settings this is. */
  widgetType?: string;
  /** A page reached by URL rather than a click. */
  url?: string;
  /** Anchors on this surface hidden behind a tab or section, mapped to the anchor ref that reveals them. */
  inner?: Readonly<Record<string, string>>;
}

export type TourSurfaceMap = Readonly<Record<string, TourSurfaceDef>>;
