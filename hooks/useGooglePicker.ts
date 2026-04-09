import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/useAuth';

/** Subset of file metadata returned by the Google Picker. */
export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

/** MIME types supported for text extraction via Google Drive API. */
const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
].join(',');

/** Max time (ms) to wait for the gapi script to become available. */
const GAPI_LOAD_TIMEOUT_MS = 15_000;

let pickerApiLoaded = false;
let pickerApiLoading = false;
const pickerApiCallbacks: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
}> = [];

/** Reject all queued callers and reset loading state. */
function rejectAllCallbacks(error: Error) {
  pickerApiLoading = false;
  const pending = pickerApiCallbacks.splice(0);
  pending.forEach((cb) => cb.reject(error));
}

/** Dynamically inject the gapi script tag if not already present. */
function injectGapiScript(): void {
  if (document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.async = true;
  document.head.appendChild(script);
}

/** Ensure the gapi picker library is loaded exactly once. */
function ensurePickerApi(): Promise<void> {
  if (pickerApiLoaded) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    pickerApiCallbacks.push({ resolve, reject });

    if (pickerApiLoading) return; // Already loading — just wait for the callback
    pickerApiLoading = true;

    injectGapiScript();

    const startTime = Date.now();

    const waitForGapi = () => {
      if (Date.now() - startTime > GAPI_LOAD_TIMEOUT_MS) {
        rejectAllCallbacks(
          new Error(
            'Google API script failed to load. Please check your network connection and try again.'
          )
        );
        return;
      }

      if (typeof gapi === 'undefined') {
        setTimeout(waitForGapi, 200);
        return;
      }

      gapi.load('picker', {
        callback: () => {
          pickerApiLoaded = true;
          pickerApiLoading = false;
          const pending = pickerApiCallbacks.splice(0);
          pending.forEach((cb) => cb.resolve());
        },
        onerror: () => {
          rejectAllCallbacks(new Error('Failed to load Google Picker API'));
        },
      });
    };

    waitForGapi();
  });
}

/**
 * Hook that wraps the Google Picker API to let users select files from Drive.
 *
 * Returns an `openPicker` function that opens the native Google file picker
 * dialog and resolves with the selected file's metadata, or `null` if the user
 * cancels.
 */
export const useGooglePicker = () => {
  const { googleAccessToken } = useAuth();
  const pickerActiveRef = useRef(false);

  const openPicker = useCallback((): Promise<PickedFile | null> => {
    if (!googleAccessToken) {
      return Promise.reject(
        new Error('Google Drive is not connected. Please sign in again.')
      );
    }

    if (pickerActiveRef.current) {
      return Promise.resolve(null);
    }

    // Set synchronously before async work to prevent race conditions
    pickerActiveRef.current = true;

    return ensurePickerApi()
      .then(() => {
        return new Promise<PickedFile | null>((resolve) => {
          const docsView = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes(SUPPORTED_MIME_TYPES)
            .setMode(google.picker.DocsViewMode.LIST);

          const apiKey = (import.meta.env.VITE_GOOGLE_API_KEY ??
            import.meta.env.VITE_FIREBASE_API_KEY) as string | undefined;

          const builder = new google.picker.PickerBuilder()
            .addView(docsView)
            .setOAuthToken(googleAccessToken)
            .setMaxItems(1)
            .setTitle('Select a file for AI context')
            .setCallback((response: google.picker.ResponseObject) => {
              const action = response[
                google.picker.Response.ACTION
              ] as google.picker.Action;

              if (action === google.picker.Action.PICKED) {
                const docs = response[google.picker.Response.DOCUMENTS];
                if (docs && docs.length > 0) {
                  const doc = docs[0];
                  resolve({
                    id: doc[google.picker.Document.ID],
                    name: doc[google.picker.Document.NAME] ?? 'Untitled',
                    mimeType: doc[google.picker.Document.MIME_TYPE] ?? '',
                  });
                } else {
                  resolve(null);
                }
                pickerActiveRef.current = false;
              } else {
                // CANCEL, ERROR, or any unexpected action — always clean up
                resolve(null);
                pickerActiveRef.current = false;
              }
            });

          if (apiKey) {
            builder.setDeveloperKey(apiKey);
          }

          const appId = (import.meta.env.VITE_GOOGLE_APP_ID ??
            import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) as
            | string
            | undefined;
          if (appId) {
            builder.setAppId(appId);
          }

          builder.build().setVisible(true);
        });
      })
      .catch((err) => {
        pickerActiveRef.current = false;
        throw err;
      });
  }, [googleAccessToken]);

  return { openPicker, isConnected: !!googleAccessToken };
};
