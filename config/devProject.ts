import { APP_NAME } from '@/config/constants';

export const IS_DEV_PROJECT =
  import.meta.env.VITE_FIREBASE_PROJECT_ID === 'spartboard-dev';

// Dev files live in their own Drive folder so dev can never write a prod file (utils/devDriveWriteGuard.ts).
export const DRIVE_APP_FOLDER = IS_DEV_PROJECT ? 'SpartBoard Dev' : APP_NAME;
