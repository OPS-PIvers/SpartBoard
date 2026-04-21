/**
 * Reads a Blob or File as base64, stripping the `data:*;base64,` prefix so
 * the raw bytes can be sent to APIs that expect a bare base64 string
 * (e.g. Gemini's `inlineData.data` field).
 */
export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIndex = dataUrl.indexOf(',');
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
