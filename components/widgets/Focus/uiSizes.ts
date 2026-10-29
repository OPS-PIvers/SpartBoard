// Every target is 44px at the default size and never under 32px.
export const SIZES = {
  sm: {
    font: 'min(15px, 4.6cqmin)',
    pad: `0 min(8px, 2.4cqmin)`,
    icon: 'min(15px, 4.6cqmin)',
    h: 'max(32px, min(45px, 9.8cqmin))',
  },
  md: {
    font: 'min(15px, 4.8cqmin)',
    pad: `0 min(15px, 3.2cqmin)`,
    icon: 'min(16px, 5cqmin)',
    h: 'max(32px, min(45px, 9.8cqmin))',
  },
  lg: {
    font: 'min(22px, 5.6cqmin)',
    pad: `0 min(18px, 4.4cqmin)`,
    icon: 'min(22px, 5.6cqmin)',
    h: 'max(32px, min(56px, 10.4cqmin))',
  },
};

/** Inputs and selects match the medium button height. */
export const FIELD_HEIGHT = SIZES.md.h;
