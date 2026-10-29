import {
  profileFromEmail,
  type ExtensionProfile,
} from '@/components/tours/web/extensionProtocol';
import { BENCH } from './bench';

/** The Chrome profile's account, read fresh each time so a profile switch is never stale. */
export async function getChromeProfile(): Promise<ExtensionProfile> {
  // The perf harness's headless Chromium has no signed-in profile.
  if (BENCH) return 'staff';
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY',
    });
    return profileFromEmail(info.email);
  } catch {
    return 'none';
  }
}

/** The Chrome profile's email, or undefined when none is signed in (focus sessions, F3). */
export async function getChromeEmail(): Promise<string | undefined> {
  if (BENCH) return undefined;
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY',
    });
    return info.email || undefined;
  } catch {
    return undefined;
  }
}
