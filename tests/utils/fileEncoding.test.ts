import { describe, it, expect } from 'vitest';
import { blobToBase64 } from '@/utils/fileEncoding';

describe('blobToBase64', () => {
  it('converts a simple text blob to base64 and strips prefix', async () => {
    const text = 'Hello, world!';
    const blob = new Blob([text], { type: 'text/plain' });

    const result = await blobToBase64(blob);

    // "Hello, world!" in base64 is "SGVsbG8sIHdvcmxkIQ=="
    expect(result).toBe(window.btoa(text));
  });

  it('converts an image blob to base64 and strips prefix', async () => {
    // A tiny 1x1 transparent pixel PNG
    const base64Png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const binaryString = window.atob(base64Png);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    const result = await blobToBase64(blob);
    expect(result).toBe(base64Png);
  });

  it('handles blobs with no media type', async () => {
    const text = 'No type';
    const blob = new Blob([text]); // No type provided

    const result = await blobToBase64(blob);

    expect(result).toBe(window.btoa(text));
  });

  it('rejects when FileReader fails', async () => {
    const blob = new Blob(['test']);
    const mockError = new Error('Simulated read failure');
    const originalFileReader = global.FileReader;

    // @ts-expect-error - Mocking FileReader for testing purposes
    global.FileReader = class {
      error = mockError;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        if (this.onerror) this.onerror();
      }
    };

    try {
      await expect(blobToBase64(blob)).rejects.toThrow(
        'Simulated read failure'
      );
    } finally {
      global.FileReader = originalFileReader;
    }
  });

  it('rejects with default error if FileReader.error is null', async () => {
    const blob = new Blob(['test']);
    const originalFileReader = global.FileReader;

    // @ts-expect-error - Mocking FileReader for testing purposes
    global.FileReader = class {
      error = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        if (this.onerror) this.onerror();
      }
    };

    try {
      await expect(blobToBase64(blob)).rejects.toThrow('Read failed');
    } finally {
      global.FileReader = originalFileReader;
    }
  });

  it('handles dataUrl without comma (unlikely but covered by code)', async () => {
    const blob = new Blob(['test']);
    const originalFileReader = global.FileReader;

    // @ts-expect-error - Mocking FileReader for testing purposes
    global.FileReader = class {
      result = 'barebase64string';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        if (this.onload) this.onload();
      }
    };

    try {
      const result = await blobToBase64(blob);
      expect(result).toBe('barebase64string');
    } finally {
      global.FileReader = originalFileReader;
    }
  });
});
