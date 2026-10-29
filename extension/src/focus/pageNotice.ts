// Injected into a student's tab (T8, F2): the "blocked" notice and Lock's "Return to fullscreen" cover; wording waits on Paul (G5).

export type PageNoticeKind = 'notice' | 'cover' | 'none';

/** Runtime message the cover's button sends; the worker answers by making the window fullscreen. */
export const FOCUS_FULLSCREEN_MESSAGE = 'focus/fullscreen';

export const NOTICE_TEXT = "That site isn't part of focus time.";
export const COVER_TITLE = 'Return to fullscreen';
export const COVER_TEXT =
  'Focus time needs fullscreen. Time outside fullscreen counts as away.';

/**
 * Runs in the page through `chrome.scripting.executeScript({ func })`, so it must reference nothing outside itself.
 * One host element per page, closed shadow root, inline styles only (CSSOM writes pass strict page CSPs).
 */
export function showPageNotice(
  kind: PageNoticeKind,
  noticeText: string,
  coverTitle: string,
  coverText: string,
  message: string
): void {
  // Separate hosts, so a notice never replaces a cover.
  const HOST_ID =
    kind === 'notice' ? 'spartboard-focus-notice' : 'spartboard-focus-cover';
  document.getElementById(HOST_ID)?.remove();
  if (kind === 'none') return;
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const box = document.createElement('div');
  box.setAttribute('role', kind === 'cover' ? 'dialog' : 'status');
  if (kind === 'notice') {
    Object.assign(host.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
    });
    Object.assign(box.style, {
      background: '#1e293b',
      color: '#fff',
      font: `600 16px/1.4 ${font}`,
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    });
    box.textContent = noticeText;
    root.append(box);
    document.documentElement.append(host);
    setTimeout(() => host.remove(), 6000);
    return;
  }
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
  });
  Object.assign(box.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    padding: '24px',
    background: '#fff',
    color: '#0f172a',
    font: `400 18px/1.5 ${font}`,
    textAlign: 'center',
  });
  box.setAttribute('aria-modal', 'true');
  const title = document.createElement('h1');
  Object.assign(title.style, { margin: '0', font: `700 28px/1.3 ${font}` });
  title.textContent = coverTitle;
  const text = document.createElement('p');
  Object.assign(text.style, {
    margin: '0',
    maxWidth: '32em',
    color: '#475569',
  });
  text.textContent = coverText;
  const button = document.createElement('button');
  button.type = 'button';
  Object.assign(button.style, {
    font: `600 18px/1 ${font}`,
    padding: '14px 24px',
    border: '0',
    borderRadius: '8px',
    background: '#2d3f89',
    color: '#fff',
    cursor: 'pointer',
  });
  button.textContent = coverTitle;
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: message });
  });
  box.append(title, text, button);
  root.append(box);
  document.documentElement.append(host);
  button.focus();
}
