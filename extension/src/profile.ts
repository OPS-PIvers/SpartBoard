import {
  profileFromEmail,
  type ExtensionProfile,
} from '@/components/tours/web/extensionProtocol';

/** The Chrome profile's account, read fresh each time so a profile switch is never stale. */
export async function getChromeProfile(): Promise<ExtensionProfile> {
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: 'ANY',
    });
    return profileFromEmail(info.email);
  } catch {
    return 'none';
  }
}
