export const SCREENS = [
  ['plc', '1. PLC Data overview'],
  ['targets', '1b. Manage targets'],
  ['gear', '2a. Gear menu'],
  ['whatsnew', "2b. What's new drawer"],
  ['myitems', '2c. My items drawer'],
  ['members', '2d. Members popover'],
  ['layout', '3. Layout editor'],
  ['dept', '4. Department Hub'],
  ['bldg', '5a. Building Hub'],
  ['updates', '5b. Building Updates'],
  ['mhub', '6a. Mentoring Program Hub'],
  ['workspace', '6b. Workspace'],
  ['tracker', '6c. Task tracker'],
  ['admin', '7. Admin: Team type defaults'],
  ['note', '8. PLC meeting note'],
] as const;

export type ScreenId = (typeof SCREENS)[number][0];
