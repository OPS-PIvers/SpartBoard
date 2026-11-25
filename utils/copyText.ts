/** Copies text and resolves false (never rejects) when the clipboard is unavailable or denied. */
export async function copyText(
  text: string,
  onError?: (err: unknown) => void
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    onError?.(err);
    return false;
  }
}
