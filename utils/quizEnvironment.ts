import type { ExtensionStatus } from '@/components/tours/web/extensionClient';
import { INSTALL_PROTOCOL } from '@/components/tours/web/extensionProtocol';

/** Whether an attempt ran in a Chrome profile the school manages, as far as the page can tell. */
export type ProfileState =
  /** The SpartBoard extension was pushed by policy into a district profile. */
  | 'managed'
  /** The extension answered but was added by hand, or the profile isn't a district one. */
  | 'unmanaged'
  /** No extension answered: another browser, or a Chrome profile the school doesn't manage. */
  | 'no-extension'
  /** The quiz is embedded in another site, where the extension never answers. */
  | 'embedded'
  /** An older extension that can't say how it was installed. */
  | 'unknown';

export interface QuizEnvironment {
  /** Such as "Chrome 141, macOS". */
  browser: string;
  profile: ProfileState;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/FxiOS\/(\d+)/, 'Firefox'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** The browser and system a user-agent string claims; it can be spoofed. */
export function describeBrowser(userAgent: string, touchPoints = 0): string {
  let browser = 'Unknown browser';
  for (const [pattern, name] of BROWSERS) {
    const m = pattern.exec(userAgent);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  let system =
    SYSTEMS.find(([p]) => p.test(userAgent))?.[1] ?? 'unknown system';
  // An iPad asks for desktop sites as a Mac, but only it has a touchscreen.
  if (system === 'macOS' && touchPoints > 1) system = 'iPad';
  return `${browser}, ${system}`;
}

export function profileState(
  status: ExtensionStatus,
  embedded: boolean
): ProfileState {
  if (embedded) return 'embedded';
  if (status.kind === 'none') return 'no-extension';
  if (status.protocol < INSTALL_PROTOCOL || !status.install) return 'unknown';
  // The extension's `staff` profile is any district account, students included.
  return status.install === 'policy' && status.profile === 'staff'
    ? 'managed'
    : 'unmanaged';
}

/** Reads this page's browser and asks the extension how it was installed. */
export async function detectQuizEnvironment(
  ping: () => Promise<ExtensionStatus>
): Promise<QuizEnvironment> {
  let embedded = true;
  try {
    embedded = window.top !== window.self;
  } catch {
    embedded = true;
  }
  let status: ExtensionStatus = { kind: 'none' };
  // A sleeping extension can miss the first ping, so silence is only believed twice.
  for (let i = 0; i < 2 && !embedded && status.kind === 'none'; i += 1)
    status = await ping();
  return {
    browser: describeBrowser(navigator.userAgent, navigator.maxTouchPoints),
    profile: profileState(status, embedded),
  };
}
