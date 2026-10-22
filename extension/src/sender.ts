/** D3: only a top frame on one of the listing's exact origins may message the extension. */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  origins: readonly string[]
): boolean {
  return (
    sender.frameId === 0 &&
    typeof sender.origin === 'string' &&
    origins.includes(sender.origin)
  );
}
