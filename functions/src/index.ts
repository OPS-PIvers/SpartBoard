import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import * as CryptoJS from 'crypto-js';
import { GoogleGenAI, Content } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { sanitizePrompt } from './sanitize';
import { parseGeminiJson } from './parseGeminiJson';

// Phase 4 — organization invitations + membership write-through.
// These modules initialize their own `admin.initializeApp()` guarded by
// `admin.apps.length`, so importing here is safe: the first import (either
// direction) wins and the others no-op. Re-exporting the callables and the
// trigger makes them deployable via `firebase deploy --only functions`.
export {
  createOrganizationInvites,
  claimOrganizationInvite,
} from './organizationInvites';
export { organizationMembersSync } from './organizationMembersSync';
export { organizationMemberCounters } from './organizationMemberCounters';
export { organizationBuildingCounters } from './organizationBuildingCounters';
export { resetOrganizationUserPassword } from './organizationResetPassword';
export { getOrgUserActivity } from './organizationUserActivity';
export { plcInvitationEmail } from './plcInviteEmails';

setGlobalOptions({ region: 'us-central1' });

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const CLASSLINK_CLIENT_ID = defineSecret('CLASSLINK_CLIENT_ID');
const CLASSLINK_CLIENT_SECRET = defineSecret('CLASSLINK_CLIENT_SECRET');
const CLASSLINK_TENANT_URL = defineSecret('CLASSLINK_TENANT_URL');
const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);
const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://spartboard.web.app',
  'https://spartboard.firebaseapp.com',
  /^https:\/\/spartboard--[\w-]+\.web\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

admin.initializeApp();

interface ClassLinkUser {
  sourcedId: string;
  email: string;
  givenName: string;
  familyName: string;
}

interface ClassLinkClass {
  sourcedId: string;
  title: string;
  classCode?: string;
}

interface ClassLinkStudent {
  sourcedId: string;
  givenName: string;
  familyName: string;
  email: string;
}

interface AIData {
  type:
    | 'mini-app'
    | 'poll'
    | 'dashboard-layout'
    | 'instructional-routine'
    | 'ocr'
    | 'quiz'
    | 'widget-builder'
    | 'widget-explainer'
    | 'blooms-ai';
  prompt?: string;
  image?: string; // base64 data
}

interface GlobalPermConfig {
  dailyLimit?: number;
  dailyLimitEnabled?: boolean;
}

interface GlobalPermission {
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'all';
  betaUsers?: string[];
  config?: GlobalPermConfig;
}

const DEFAULT_ADVANCED_MODEL = 'gemini-3-flash-preview';
const DEFAULT_STANDARD_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * Validates and normalises a Gemini model name.
 * Returns `undefined` when the supplied value is falsy or fails the pattern
 * check, so callers can fall back to a default.
 */
function normalizeModelName(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^gemini-[\w.-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

interface GeminiModelConfig {
  advancedModel?: string;
  standardModel?: string;
}

/**
 * Reads the admin-configured model overrides from the `gemini-functions`
 * global permissions document. Returns validated model names (or defaults).
 */
async function getGeminiModelConfig(
  db: admin.firestore.Firestore
): Promise<{ advancedModel: string; standardModel: string }> {
  try {
    const doc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const cfg = doc.data()?.config as GeminiModelConfig | undefined;
    return {
      advancedModel:
        normalizeModelName(cfg?.advancedModel) ?? DEFAULT_ADVANCED_MODEL,
      standardModel:
        normalizeModelName(cfg?.standardModel) ?? DEFAULT_STANDARD_MODEL,
    };
  } catch (error) {
    console.warn(
      'Failed to read Gemini model config from Firestore; using defaults.',
      error
    );
    return {
      advancedModel: DEFAULT_ADVANCED_MODEL,
      standardModel: DEFAULT_STANDARD_MODEL,
    };
  }
}

interface ArchiveActivityWallPhotoData {
  accessToken?: string;
  sessionId?: string;
  submissionId?: string;
  activityId?: string;
  status?: 'approved' | 'pending';
}

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const APP_DRIVE_FOLDER = 'SpartBoard';

const getDriveHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
});

const listDriveFiles = async (
  accessToken: string,
  query: string
): Promise<Array<{ id: string; name: string }>> => {
  const url = new URL(`${DRIVE_API_URL}/files`);
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'files(id,name)');

  const response = await fetch(url.toString(), {
    headers: getDriveHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to list Drive files (${response.status})`);
  }

  const data = (await response.json()) as {
    files?: Array<{ id: string; name: string }>;
  };
  return data.files ?? [];
};

const getOrCreateDriveFolder = async (
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<string> => {
  const escapedFolderName = folderName
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  let query = `name = '${escapedFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const existing = await listDriveFiles(accessToken, query);
  if (existing[0]?.id) return existing[0].id;

  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Drive folder ${folderName}`);
  }

  const folder = (await response.json()) as { id: string };
  return folder.id;
};

const getDriveFolderPath = async (
  accessToken: string,
  path: string
): Promise<string> => {
  const parts = path.split('/').filter(Boolean);
  let parentId = await getOrCreateDriveFolder(accessToken, APP_DRIVE_FOLDER);

  for (const part of parts) {
    parentId = await getOrCreateDriveFolder(accessToken, part, parentId);
  }

  return parentId;
};

const uploadBlobToDrive = async (
  accessToken: string,
  blob: Buffer,
  mimeType: string,
  fileName: string,
  folderPath: string
): Promise<{ id: string }> => {
  const folderId = await getDriveFolderPath(accessToken, folderPath);

  const createResponse = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
    }),
  });

  if (!createResponse.ok) {
    throw new Error('Failed to create file metadata in Drive');
  }

  const driveFile = (await createResponse.json()) as { id: string };

  const uploadResponse = await fetch(
    `${UPLOAD_API_URL}/files/${driveFile.id}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: blob,
    }
  );

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file content to Drive');
  }

  return driveFile;
};

const makeDriveFilePublic = async (
  accessToken: string,
  fileId: string
): Promise<void> => {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: getDriveHeaders(accessToken),
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!response.ok) {
    throw new Error('Failed to share file in Drive');
  }
};

/**
 * Generates OAuth 1.0 Headers for ClassLink
 */
function getOAuthHeaders(
  baseUrl: string,
  params: Record<string, string>,
  method: string,
  clientId: string,
  clientSecret: string
) {
  const oauth = new OAuth({
    consumer: {
      key: clientId,
      secret: clientSecret,
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string) {
      return CryptoJS.HmacSHA1(base_string, key).toString(CryptoJS.enc.Base64);
    },
  });

  const request_data = {
    url: baseUrl,
    method: method,
    data: params,
  };

  return oauth.toHeader(oauth.authorize(request_data));
}

export const getClassLinkRosterV1 = onCall(
  {
    memory: '256MiB',
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
    ],
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const userEmail = request.auth.token.email;
    if (!userEmail) {
      throw new HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const clientId = CLASSLINK_CLIENT_ID.value();
    const clientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();

    if (!clientId || !clientSecret || !tenantUrl) {
      throw new HttpsError(
        'internal',
        'ClassLink configuration is missing on the server.'
      );
    }

    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');

    try {
      if (!isSafeEmailForOneRosterFilter(userEmail)) {
        return { classes: [], studentsByClass: {} };
      }
      const usersBaseUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users`;
      const userParams = { filter: `email='${userEmail}'` };

      const userHeaders = getOAuthHeaders(
        usersBaseUrl,
        userParams,
        'GET',
        clientId,
        clientSecret
      );

      const userResponse = await axios.get<{ users: ClassLinkUser[] }>(
        usersBaseUrl,
        {
          params: userParams,
          headers: { ...userHeaders },
        }
      );

      const users = userResponse.data.users;

      if (!users || users.length === 0) {
        return { classes: [], studentsByClass: {} };
      }

      const teacherSourcedId = users[0].sourcedId;

      const classesUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users/${teacherSourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        clientId,
        clientSecret
      );

      const classesResponse = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      const classes = classesResponse.data.classes;

      const studentsByClass: Record<string, ClassLinkStudent[]> = {};

      await Promise.all(
        classes.map(async (cls: ClassLinkClass) => {
          const studentsUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/classes/${cls.sourcedId}/students`;
          const studentsHeaders = getOAuthHeaders(
            studentsUrl,
            {},
            'GET',
            clientId,
            clientSecret
          );
          try {
            const studentsResponse = await axios.get<{
              users: ClassLinkStudent[];
            }>(studentsUrl, { headers: { ...studentsHeaders } });
            studentsByClass[cls.sourcedId] = studentsResponse.data.users ?? [];
          } catch {
            studentsByClass[cls.sourcedId] = [];
          }
        })
      );

      return {
        classes,
        studentsByClass,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        throw new HttpsError(
          'internal',
          `Failed to fetch data from ClassLink: ${axiosError.message}`
        );
      }
      throw new HttpsError('internal', 'Failed to fetch data from ClassLink');
    }
  }
);

export const generateWithAI = onCall(
  {
    memory: '512MiB',
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    const data = request.data as AIData;
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;

    if (!email) {
      throw new HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const db = admin.firestore();

    // Check if user is an admin
    const adminDoc = await db
      .collection('admins')
      .doc(email.toLowerCase())
      .get();
    const isAdmin = adminDoc.exists;

    // 1. Determine specific feature ID if applicable
    let specificFeatureId: string | null = null;
    const genType = String(data?.type || '')
      .toLowerCase()
      .trim();
    if (genType === 'mini-app') specificFeatureId = 'embed-mini-app';
    if (genType === 'poll') specificFeatureId = 'smart-poll';
    if (genType === 'quiz') specificFeatureId = 'quiz';
    if (genType === 'video-activity')
      specificFeatureId = 'video-activity-audio-transcription';
    if (genType === 'ocr') specificFeatureId = 'ocr';
    if (genType === 'guided-learning') specificFeatureId = 'guided-learning';
    if (genType === 'blooms-ai') specificFeatureId = 'blooms-ai';

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      await db.runTransaction(async (transaction) => {
        // --- Read current usage (needed for both tracking and limits) ---
        const overallUsageRef = db
          .collection('ai_usage')
          .doc(`${uid}_${today}`);
        const overallUsageDoc = await transaction.get(overallUsageRef);
        const currentOverallUsage = overallUsageDoc.exists
          ? (overallUsageDoc.data()?.count as number) || 0
          : 0;

        let specificUsageRef: admin.firestore.DocumentReference | null = null;
        let currentSpecificUsage = 0;

        if (specificFeatureId) {
          specificUsageRef = db
            .collection('ai_usage')
            .doc(`${uid}_${specificFeatureId}_${today}`);
          const specUsageDoc = await transaction.get(specificUsageRef);
          currentSpecificUsage = specUsageDoc.exists
            ? (specUsageDoc.data()?.count as number) || 0
            : 0;
        }

        // --- Rate-limit checks (non-admin only) ---
        if (!isAdmin) {
          const globalPermDoc = await transaction.get(
            db.collection('global_permissions').doc('gemini-functions')
          );
          const globalPerm = globalPermDoc.exists
            ? (globalPermDoc.data() as GlobalPermission)
            : null;

          if (globalPerm && !globalPerm.enabled) {
            throw new HttpsError(
              'permission-denied',
              'Gemini functions are currently disabled by an administrator.'
            );
          }

          if (globalPerm) {
            const { accessLevel, betaUsers = [] } = globalPerm;
            if (accessLevel === 'admin') {
              throw new HttpsError(
                'permission-denied',
                'Gemini functions are currently restricted to administrators.'
              );
            }
            if (
              accessLevel === 'beta' &&
              !betaUsers.includes(email.toLowerCase())
            ) {
              throw new HttpsError(
                'permission-denied',
                'You do not have access to Gemini beta functions.'
              );
            }
          }

          const overallLimitEnabled =
            globalPerm?.config?.dailyLimitEnabled !== false;
          const overallLimit = globalPerm?.config?.dailyLimit ?? 20;

          if (overallLimitEnabled && currentOverallUsage >= overallLimit) {
            throw new HttpsError(
              'resource-exhausted',
              `Daily AI usage limit reached (${overallLimit} generations). Please try again tomorrow.`
            );
          }

          // --- Check Specific Feature Limit ---
          if (specificFeatureId) {
            const specPermDoc = await transaction.get(
              db.collection('global_permissions').doc(specificFeatureId)
            );
            if (specPermDoc.exists) {
              const specPerm = specPermDoc.data() as GlobalPermission;
              const specLimitEnabled =
                specPerm.config?.dailyLimitEnabled !== false;
              const specificLimit = specPerm.config?.dailyLimit ?? 20;

              if (specLimitEnabled && currentSpecificUsage >= specificLimit) {
                throw new HttpsError(
                  'resource-exhausted',
                  `Daily limit for ${specificFeatureId} reached (${specificLimit} per day). Please try again tomorrow.`
                );
              }
            }
          }
        }

        // --- Increment usage counters (all users including admins) ---
        transaction.set(
          overallUsageRef,
          {
            count: currentOverallUsage + 1,
            email: email,
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        if (specificUsageRef) {
          transaction.set(
            specificUsageRef,
            {
              count: currentSpecificUsage + 1,
              email: email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      });
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('Usage tracking error:', error);
      // Don't block AI generation if tracking fails
      console.warn('AI usage tracking failed, proceeding with generation.');
    }

    // Read model config from Firestore (for both admins and non-admins)
    const geminiConfig = await getGeminiModelConfig(db);

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      console.error('CRITICAL: GEMINI_API_KEY is missing');
      throw new HttpsError(
        'internal',
        'Gemini API Key is missing on the server.'
      );
    }

    try {
      const genType = String(data?.type || '')
        .toLowerCase()
        .trim();

      const ai = new GoogleGenAI({ apiKey });

      // Input size guards
      if (data?.prompt && String(data.prompt).length > 10000) {
        throw new HttpsError(
          'invalid-argument',
          'Prompt exceeds maximum length of 10,000 characters.'
        );
      }
      if (data?.image && String(data.image).length > 5 * 1024 * 1024) {
        throw new HttpsError(
          'invalid-argument',
          'Image exceeds maximum size of 5MB.'
        );
      }

      const sanitizedUserInput = sanitizePrompt(data?.prompt);

      const promptMap: Record<
        string,
        () => { systemPrompt: string; userPrompt: string }
      > = {
        'mini-app': () => ({
          systemPrompt: `
You are an expert frontend developer. Create a single-file HTML/JS mini-app based on the user's request provided within <user_request> tags.

Output requirements:
1. Single file — all CSS and JS embedded inline. No external scripts except Tailwind CDN.
2. Use Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
3. Return JSON only: { "title": "...", "html": "..." }

Submission protocol (MANDATORY — every app must implement this exactly):

A. Render a visible <button data-spart-submit> somewhere obvious (usually near the bottom of the main content). Its label should be meaningful for the activity ("Submit", "Done", "Turn In", etc.). Style it with Tailwind so it looks like a primary action.

B. On load, register a persistent listener for init messages from the parent and show/hide the submit button based on the latest message. The parent may re-send SPART_MINIAPP_INIT at any time (e.g. the teacher flips the Submissions toggle mid-session), so the handler MUST stay registered and re-apply state on every message — do NOT use { once: true } and do NOT remove the listener after the first message:

   window.addEventListener('message', (event) => {
     if (event.data && event.data.type === 'SPART_MINIAPP_INIT') {
       const enabled = event.data.payload && event.data.payload.submissionsEnabled === true;
       document.querySelectorAll('[data-spart-submit]').forEach((el) => {
         el.style.display = enabled ? '' : 'none';
       });
     }
   });

C. When (and ONLY when) the user clicks the submit button, post the result to the parent. Use event delegation on window with closest('[data-spart-submit]') so the handler survives any DOM re-renders and catches multiple submit buttons:

   window.addEventListener('click', (event) => {
     const btn = event.target.closest && event.target.closest('[data-spart-submit]');
     if (!btn) return;
     window.parent.postMessage({
       type: 'SPART_MINIAPP_RESULT',
       payload: { /* whatever data the activity produced — object only, no PII */ }
     }, '*');
   });

Do NOT auto-submit on every input, key press, or timer tick. The parent treats each SPART_MINIAPP_RESULT message as a student submission, so fire it exactly once per Submit click. The payload must be a plain object (not a scalar or array).

Worked example (flashcards app with a "Done" button):

<!doctype html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-6 font-sans">
  <div id="card" class="text-2xl font-bold text-center p-8 bg-white rounded-xl shadow"></div>
  <div class="mt-4 flex gap-2 justify-center">
    <button id="flip" class="px-4 py-2 bg-slate-200 rounded">Flip</button>
    <button id="next" class="px-4 py-2 bg-slate-200 rounded">Next</button>
  </div>
  <div class="mt-6 text-center">
    <button data-spart-submit class="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl">Finish</button>
  </div>
  <script>
    const cards = [{ q: '2+2', a: '4' }, { q: '3x3', a: '9' }];
    let i = 0, showA = false;
    const el = document.getElementById('card');
    const render = () => { el.textContent = showA ? cards[i].a : cards[i].q; };
    document.getElementById('flip').onclick = () => { showA = !showA; render(); };
    document.getElementById('next').onclick = () => { i = (i+1)%cards.length; showA=false; render(); };
    render();

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SPART_MINIAPP_INIT') {
        const enabled = e.data.payload && e.data.payload.submissionsEnabled === true;
        document.querySelectorAll('[data-spart-submit]').forEach((b) => {
          b.style.display = enabled ? '' : 'none';
        });
      }
    });

    window.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('[data-spart-submit]');
      if (!btn) return;
      window.parent.postMessage({
        type: 'SPART_MINIAPP_RESULT',
        payload: { reviewed: cards.length, completedAt: Date.now() }
      }, '*');
    });
  </script>
</body>
</html>
        `,
          userPrompt: `User Request: <user_request>${sanitizedUserInput}</user_request>`,
        }),
        poll: () => ({
          systemPrompt: `
          You are an expert teacher. Create a 4-option multiple choice poll JSON based on the topic provided within <topic> tags:
          { "question": "...", "options": ["...", "...", "...", "..."] }
        `,
          userPrompt: `Topic: <topic>${sanitizedUserInput}</topic>`,
        }),
        'dashboard-layout': () => ({
          systemPrompt: `
          You are an expert instructional designer and classroom space planner. Based on the user's lesson description provided within <lesson_description> tags, suggest a set of interactive widgets and arrange them on a 12x12 grid (columns 0-11, rows 0-11).

          Available Widgets (use EXACT type strings):
          - clock: Digital/analog clock
          - time-tool: Timer/Stopwatch
          - traffic: Traffic light for behavior/status
          - text: Simple sticky note/text area
          - checklist: To-do list
          - random: Student/item picker
          - dice: Random dice roller
          - sound: Noise level meter
          - drawing: Sketchpad
          - qr: QR code generator
          - embed: Website embedder
          - poll: Multiple choice poll
          - quiz: Interactive classroom quizzes
          - webcam: Live camera feed with OCR capabilities
          - scoreboard: Point tracker
          - expectations: Classroom expectations icons
          - weather: Local weather display
          - schedule: Daily class schedule
          - calendar: Monthly events
          - lunchCount: Student meal tracker
          - classes: Class/Period selector
          - instructionalRoutines: Library of teaching strategies (e.g. Think-Pair-Share)
          - materials: Visual list of required student supplies
          - stickers: Reward/decorative stickers
          - seating-chart: Classroom layout manager
          - catalyst: Instructional warm-ups/activities

          Spatial Grid Rules (12x12):
          1. Total grid width is 12 columns (0-11). Total grid height is 12 rows (0-11).
          2. Avoid overlapping widgets.
          3. For every widget, you MUST provide a gridConfig object with col, row, colSpan, and rowSpan.
          4. Large, primary widgets (like Quizzes, Scoreboards, or Whiteboards) should have large spans (e.g., colSpan: 8, rowSpan: 8) and be placed centrally.
          5. Utility widgets (like Timers, Traffic Lights, Dice) should be placed on the edges with smaller spans (e.g., colSpan: 2, rowSpan: 3).

          Requirements:
          1. Select 3-6 most relevant widgets for the activity.
          2. Return JSON: { "widgets": [{ "type": "...", "config": {}, "gridConfig": { "col": 0, "row": 0, "colSpan": 4, "rowSpan": 4 } }] }
          3. 'config' should be an empty object {} unless you are setting a specific property known to that widget (like 'question' for 'poll').

          Example Payload for a 'Review Game':
          {
            "widgets": [
              {
                "type": "scoreboard",
                "config": {},
                "gridConfig": { "col": 1, "row": 0, "colSpan": 10, "rowSpan": 3 }
              },
              {
                "type": "poll",
                "config": { "question": "Who won the war of 1812?" },
                "gridConfig": { "col": 1, "row": 3, "colSpan": 7, "rowSpan": 8 }
              },
              {
                "type": "random",
                "config": { "visualStyle": "wheel" },
                "gridConfig": { "col": 8, "row": 3, "colSpan": 3, "rowSpan": 8 }
              }
            ]
          }
        `,
          userPrompt: `Lesson/Activity Description: <lesson_description>${sanitizedUserInput}</lesson_description>`,
        }),
        'instructional-routine': () => ({
          systemPrompt: `
          You are an expert instructional designer. Create a classroom instructional routine based on the user's description provided within <description> tags.

          Return JSON:
          {
            "name": "Routine Name",
            "grades": "Grade Range (e.g. K-5, 6-12)",
            "icon": "Lucide Icon Name (e.g. Brain, Users, Zap)",
            "color": "Color Name (blue, indigo, violet, purple, fuchsia, pink, rose, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, slate, zinc, stone, neutral)",
            "steps": [
              {
                "text": "Step instruction...",
                "icon": "Lucide Icon Name",
                "color": "Color Name",
                "label": "Short Label (e.g. Pair, Share)"
              }
            ]
          }
        `,
          userPrompt: `Description: <description>${sanitizedUserInput}</description>`,
        }),
        ocr: () => ({
          systemPrompt: `
          You are an expert at extracting text from images (OCR).
          Analyze the provided image and extract all readable text accurately.
          Maintain the structure as best as possible.
          If there are multiple paragraphs, separate them with double newlines.
          Return JSON: { "text": "extracted text here" }
        `,
          userPrompt: 'Extract text from this image.',
        }),
        quiz: () => ({
          systemPrompt: `
          You are an expert teacher creating a classroom quiz.
          Generate a quiz based on the topic or content provided within <topic> tags.
          Return JSON in this exact format:
          {
            "title": "Quiz title",
            "questions": [
              {
                "text": "Question text",
                "type": "MC",
                "correctAnswer": "The correct answer",
                "incorrectAnswers": ["Wrong answer 1", "Wrong answer 2", "Wrong answer 3"],
                "timeLimit": 30
              }
            ]
          }
          Rules:
          1. Generate 5-10 questions unless the user specifies a number.
          2. Use only "MC" (Multiple Choice) type.
          3. Each question must have exactly 3 incorrect answers.
          4. Time limit should be 20-60 seconds depending on question complexity.
          5. Questions should progress from easier to harder.
        `,
          userPrompt: `Topic/Content: <topic>${sanitizedUserInput}</topic>`,
        }),
        'widget-builder': () => ({
          systemPrompt: `
          You are an expert frontend developer creating classroom widgets. Create a complete self-contained HTML widget for a classroom dashboard.
          Requirements:
          1. Use vanilla HTML/CSS/JS only (no external libraries except optional Tailwind CDN).
          2. Use a dark background (#1e293b) with light text.
          3. Include all styles inline in the HTML file.
          4. The widget must work in a sandboxed iframe.
          5. Make buttons and interactive elements large enough for tablet use.
          6. Output ONLY the complete HTML code, nothing else - no explanations, no markdown.
          `,
          userPrompt: `Create a widget that: <user_request>${sanitizedUserInput}</user_request>`,
        }),
        'widget-explainer': () => ({
          systemPrompt: `
          You are a classroom teacher assistant. Explain what an HTML widget does in 1-2 plain sentences.
          Use simple language without code jargon.
          Output ONLY the explanation, nothing else.
          `,
          userPrompt: sanitizedUserInput,
        }),
        'blooms-ai': () => ({
          systemPrompt: `
          You are an expert instructional designer specializing in Bloom's Taxonomy.
          Generate clear, practical, classroom-ready content for the requested cognitive level and topic.
          Format your response as a readable bulleted list using plain text (not markdown).
          Keep each item concise (one sentence). Output ONLY the list, no preamble or closing.
          `,
          userPrompt: sanitizedUserInput,
        }),
      };

      const promptDataFn = promptMap[genType];

      if (!promptDataFn) {
        const debugData = {
          receivedType: data?.type,
          typeOfReceivedType: typeof data?.type,
          genType,
          keys: Object.keys(data || {}),
        };
        console.error(
          'CRITICAL: Invalid generation type encountered:',
          JSON.stringify(debugData)
        );
        throw new HttpsError(
          'invalid-argument',
          `V3 ERROR: Invalid generation type: "${data?.type}". Received keys: ${Object.keys(data || {}).join(', ')}`
        );
      }

      const { systemPrompt, userPrompt } = promptDataFn();

      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n' + userPrompt }],
        },
      ];

      // Add image if provided (for OCR or multi-modal prompts)
      if (data.image && contents[0] && contents[0].parts) {
        // Strip data:image/png;base64, prefix if present
        const base64Data = data.image.includes(',')
          ? data.image.split(',')[1]
          : data.image;

        contents[0].parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data,
          },
        });
      }

      // Use higher complexity model for code generation, and lite for OCR and simple JSON tasks
      // Model names are admin-configurable via global_permissions/gemini-functions
      const model =
        genType === 'mini-app' || genType === 'widget-builder'
          ? geminiConfig.advancedModel
          : geminiConfig.standardModel;

      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          // widget-builder, widget-explainer, and blooms-ai return plain text; all other types return JSON
          responseMimeType:
            genType === 'widget-builder' ||
            genType === 'widget-explainer' ||
            genType === 'blooms-ai'
              ? 'text/plain'
              : 'application/json',
        },
      });

      const text = result.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      // blooms-ai returns plain text — wrap in { text } for the generic callAI client
      if (genType === 'blooms-ai') {
        return { text };
      }

      // widget-builder and widget-explainer return plain text — wrap in { result } for the client
      if (genType === 'widget-builder' || genType === 'widget-explainer') {
        return { result: text };
      }

      return parseGeminiJson<Record<string, unknown>>(text);
    } catch (error: unknown) {
      console.error('AI Generation Error Details:', error);

      // If it's already an HttpsError, just re-throw it
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new HttpsError('internal', `AI generation failed: ${detail}`);
    }
  }
);

export const fetchExternalProxy = onCall(
  {
    memory: '128MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const data = request.data as { url: string };
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    try {
      const parsedUrl = new URL(data.url);
      if (
        parsedUrl.protocol !== 'https:' ||
        (parsedUrl.hostname !== 'api.openweathermap.org' &&
          parsedUrl.hostname !== 'owc.enterprise.earthnetworks.com' &&
          parsedUrl.hostname !== 'orono.api.nutrislice.com')
      ) {
        throw new Error('Invalid host or protocol');
      }
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'Invalid proxy URL. Only https://api.openweathermap.org, https://owc.enterprise.earthnetworks.com, and https://orono.api.nutrislice.com are allowed.'
      );
    }

    try {
      const response = await axios.get<unknown>(data.url);
      return response.data;
    } catch (error: unknown) {
      console.error('External Proxy Error:', error);
      const msg =
        error instanceof Error ? error.message : 'External fetch failed';
      throw new HttpsError('internal', msg);
    }
  }
);

export const archiveActivityWallPhoto = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (request) => {
    const data = request.data as ArchiveActivityWallPhotoData;
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const accessToken = data.accessToken?.trim();
    const sessionId = data.sessionId?.trim();
    const submissionId = data.submissionId?.trim();
    const activityId = data.activityId?.trim();
    const status = data.status === 'pending' ? 'pending' : 'approved';

    if (!accessToken || !sessionId || !submissionId || !activityId) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required archive parameters.'
      );
    }

    if (!sessionId.startsWith(`${request.auth.uid}_`)) {
      throw new HttpsError(
        'permission-denied',
        'You can only archive your own Activity Wall submissions.'
      );
    }

    const submissionRef = admin
      .firestore()
      .collection('activity_wall_sessions')
      .doc(sessionId)
      .collection('submissions')
      .doc(submissionId);

    await submissionRef.set(
      {
        status,
        archiveStatus: 'syncing',
        archiveStartedAt: Date.now(),
        archiveError: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );

    try {
      const submissionSnap = await submissionRef.get();
      if (!submissionSnap.exists) {
        throw new Error('Submission not found');
      }

      const submission = submissionSnap.data() as {
        storagePath?: unknown;
      };
      const storagePath =
        typeof submission.storagePath === 'string'
          ? submission.storagePath
          : null;

      if (!storagePath) {
        throw new Error('Missing Firebase storage path for photo submission');
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [fileBuffer] = await file.download();
      const [metadata] = await file.getMetadata();
      const mimeType = metadata.contentType || 'image/jpeg';
      const extension =
        mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/gif'
            ? 'gif'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'jpg';

      const driveFile = await uploadBlobToDrive(
        accessToken,
        fileBuffer,
        mimeType,
        `${submissionId}.${extension}`,
        `Activity Wall/${activityId}`
      );
      await makeDriveFilePublic(accessToken, driveFile.id);

      const driveUrl = `https://lh3.googleusercontent.com/d/${driveFile.id}`;

      await submissionRef.set(
        {
          content: driveUrl,
          status,
          archiveStatus: 'archived',
          archiveStartedAt: admin.firestore.FieldValue.delete(),
          driveFileId: driveFile.id,
          archivedAt: Date.now(),
          storagePath: admin.firestore.FieldValue.delete(),
          archiveError: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );

      await file.delete({ ignoreNotFound: true });

      return {
        archiveStatus: 'archived',
        driveFileId: driveFile.id,
        driveUrl,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Drive archive failed';

      await submissionRef.set(
        {
          status,
          archiveStatus: 'failed',
          archiveStartedAt: admin.firestore.FieldValue.delete(),
          archiveError: message.slice(0, 180),
        },
        { merge: true }
      );

      throw new HttpsError('internal', message);
    }
  }
);

export const checkUrlCompatibility = onCall(
  {
    memory: '128MiB',
    timeoutSeconds: 20,
  },
  async (request) => {
    const data = request.data as { url: string };
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    // Validate URL to prevent SSRF
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(data.url);
    } catch {
      throw new HttpsError('invalid-argument', 'Invalid URL provided.');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new HttpsError('invalid-argument', 'Only HTTPS URLs are allowed.');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    // Block private/reserved IP ranges and metadata endpoints
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^metadata\./,
      /metadata\.google\.internal/,
    ];
    if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
      throw new HttpsError(
        'invalid-argument',
        'URLs pointing to private or reserved IP ranges are not allowed.'
      );
    }

    try {
      const response = await axios.head(data.url, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const xFrameOptions = (
        (response.headers['x-frame-options'] as string) || ''
      ).toLowerCase();
      const csp = (
        (response.headers['content-security-policy'] as string) || ''
      ).toLowerCase();

      let isEmbeddable = true;
      let reason = '';

      if (xFrameOptions === 'deny' || xFrameOptions === 'sameorigin') {
        isEmbeddable = false;
        reason = `Site specifies 'X-Frame-Options: ${xFrameOptions.toUpperCase()}'.`;
      } else if (csp.includes('frame-ancestors')) {
        // Very basic check - if frame-ancestors is present and doesn't explicitly allow all or the current origin
        // In a real scenario, we'd need to parse the CSP properly, but 'self' or 'none' are the most common blocks.
        if (csp.includes("'self'") || csp.includes("'none'")) {
          isEmbeddable = false;
          reason =
            'Site has a strict Content Security Policy (frame-ancestors).';
        }
      }

      return {
        isEmbeddable,
        reason,
        headers: {
          'x-frame-options': xFrameOptions,
          'content-security-policy': csp,
        },
      };
    } catch (error: unknown) {
      console.error('Compatibility Check Error:', error);
      // Some sites block HEAD requests or have other issues
      return {
        isEmbeddable: true, // Assume okay if we can't check, but we'll flag the error
        error: error instanceof Error ? error.message : 'Failed to check site',
        uncertain: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Video Activity: Caption-based AI question generation
// ---------------------------------------------------------------------------

interface VideoActivityRequestData {
  url: string;
  questionCount: number;
}

interface GeneratedVideoQuestion {
  text: string;
  timestamp: number;
  correctAnswer: string;
  incorrectAnswers: string[];
  timeLimit: number;
}

interface GeneratedVideoActivity {
  title: string;
  questions: GeneratedVideoQuestion[];
}

/**
 * Uses Gemini's multimodal video understanding to analyze a YouTube video
 * and generate timestamped multiple-choice questions.
 */
export const generateVideoActivity = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    secrets: [GEMINI_API_KEY],
  },
  async (request): Promise<GeneratedVideoActivity> => {
    const data = request.data as VideoActivityRequestData;
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;

    if (!email) {
      throw new HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const { url, questionCount } = data;

    if (!url || typeof url !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'A valid YouTube URL is required.'
      );
    }

    const count = Math.min(Math.max(Number(questionCount) || 5, 1), 20);

    // Extract video ID from URL
    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/
    );
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      throw new HttpsError(
        'invalid-argument',
        'Could not extract a video ID from the provided URL. Please paste a valid YouTube link.'
      );
    }

    const db = admin.firestore();

    // Check if user is an admin (unlimited)
    const adminDoc = await db
      .collection('admins')
      .doc(email.toLowerCase())
      .get();
    const isAdmin = adminDoc.exists;

    if (!isAdmin) {
      // --- Check Overall Gemini Limit ---
      const today = new Date().toISOString().split('T')[0];
      const overallUsageRef = db.collection('ai_usage').doc(`${uid}_${today}`);

      try {
        await db.runTransaction(async (transaction) => {
          const globalPermDoc = await transaction.get(
            db.collection('global_permissions').doc('gemini-functions')
          );
          const globalPerm = globalPermDoc.data() as
            | GlobalPermission
            | undefined;

          if (globalPerm && !globalPerm.enabled) {
            throw new HttpsError(
              'permission-denied',
              'Gemini functions are currently disabled by an administrator.'
            );
          }

          const overallLimitEnabled =
            globalPerm?.config?.dailyLimitEnabled !== false;
          const overallLimit = globalPerm?.config?.dailyLimit ?? 20;

          const overallUsageDoc = await transaction.get(overallUsageRef);
          const currentOverallUsage =
            (overallUsageDoc.data()?.count as number) || 0;

          if (overallLimitEnabled && currentOverallUsage >= overallLimit) {
            throw new HttpsError(
              'resource-exhausted',
              `Daily AI usage limit reached (${overallLimit} generations). Please try again tomorrow.`
            );
          }

          transaction.set(
            overallUsageRef,
            {
              count: currentOverallUsage + 1,
              email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('Usage check error:', error);
        throw new HttpsError('internal', 'Failed to verify AI usage limits.');
      }
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError(
        'internal',
        'Gemini API Key is missing on the server.'
      );
    }

    // Read model config from Firestore
    const geminiConfig = await getGeminiModelConfig(db);
    const videoModel = geminiConfig.standardModel;

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are an expert teacher creating a video comprehension activity.
Watch the provided YouTube video and generate exactly ${count} multiple-choice questions that check understanding of key concepts.

CRITICAL RULES:
1. Each question's "timestamp" field MUST be an integer representing the exact second from the start of the video when the answer is discussed.
1b. The question should be asked AFTER students have heard the explanation, so choose a timestamp near the END of the relevant explanation segment (not the beginning).
2. Questions must be in ascending timestamp order.
3. Each question must have exactly 3 plausible but clearly incorrect answers.
4. Only use "MC" (Multiple Choice) type.
5. Time limit should be 20-45 seconds per question.
6. Return ONLY valid JSON — no markdown fences, no commentary.

Return JSON in this exact format:
{
  "title": "Short descriptive activity title based on video content",
  "questions": [
    {
      "text": "Question text here?",
      "timestamp": 42,
      "correctAnswer": "The correct answer",
      "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "timeLimit": 30
    }
  ]
}`;

    try {
      const result = await ai.models.generateContent({
        model: videoModel,
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              {
                fileData: {
                  fileUri: `https://www.youtube.com/watch?v=${videoId}`,
                  mimeType: 'video/mp4',
                },
              },
            ],
          },
        ],
        config: { responseMimeType: 'application/json' },
      });

      const text = result.text;
      if (!text) throw new Error('Empty response from AI');

      const parsed = parseGeminiJson<GeneratedVideoActivity>(text);

      if (
        !parsed.title ||
        !Array.isArray(parsed.questions) ||
        parsed.questions.length === 0
      ) {
        throw new Error('Invalid response structure from AI');
      }

      return parsed;
    } catch (error: unknown) {
      console.error('[generateVideoActivity] Gemini error:', error);
      const detail = error instanceof Error ? error.message : 'unknown error';
      throw new HttpsError(
        'internal',
        `AI generation failed (model: ${videoModel}): ${detail}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Video Activity: Admin-gated Gemini audio transcription fallback
// For videos that do not have captions available.
// ---------------------------------------------------------------------------

interface AudioTranscriptionRequestData {
  url: string;
  questionCount: number;
}

interface AudioTranscriptionPermConfig {
  dailyLimit?: number;
  dailyLimitEnabled?: boolean;
  model?: string;
}

interface AudioTranscriptionPerm {
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'all';
  betaUsers?: string[];
  config?: AudioTranscriptionPermConfig;
}

/**
 * Admin-only fallback: uses Gemini multimodal to transcribe a video that has
 * no captions, then generates timestamped quiz questions.
 *
 * Gated behind global_permissions/video-activity-audio-transcription.
 * Separate daily usage counter to control costs independently.
 *
 * NOTE: Audio/video extraction from YouTube may be subject to YouTube Terms of
 * Service. This feature is disabled by default and must be explicitly enabled
 * by an administrator who accepts the associated risk.
 */
export const transcribeVideoWithGemini = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    secrets: [GEMINI_API_KEY],
  },
  async (request): Promise<GeneratedVideoActivity> => {
    const data = request.data as AudioTranscriptionRequestData;
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;

    if (!email) {
      throw new HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const db = admin.firestore();

    // Check feature permission — admin-gated, off by default
    const permDoc = await db
      .collection('global_permissions')
      .doc('video-activity-audio-transcription')
      .get();

    if (!permDoc.exists) {
      throw new HttpsError(
        'permission-denied',
        'Gemini audio transcription is not enabled. An administrator must enable it in Feature Permissions.'
      );
    }

    const perm = permDoc.data() as AudioTranscriptionPerm;

    if (!perm.enabled) {
      throw new HttpsError(
        'permission-denied',
        'Gemini audio transcription is currently disabled.'
      );
    }

    // Check admin status
    const adminDoc = await db
      .collection('admins')
      .doc(email.toLowerCase())
      .get();
    const isAdmin = adminDoc.exists;

    if (!isAdmin) {
      if (perm.accessLevel === 'admin') {
        throw new HttpsError(
          'permission-denied',
          'Gemini audio transcription is restricted to administrators.'
        );
      }
      if (
        perm.accessLevel === 'beta' &&
        !perm.betaUsers?.includes(email.toLowerCase())
      ) {
        throw new HttpsError(
          'permission-denied',
          'You do not have access to Gemini audio transcription.'
        );
      }
    }

    if (!isAdmin) {
      // --- Dual Limit Check (Overall + Specific) ---
      const today = new Date().toISOString().split('T')[0];
      const overallUsageRef = db.collection('ai_usage').doc(`${uid}_${today}`);
      const specificUsageRef = db
        .collection('ai_usage')
        .doc(`${uid}_video-activity-audio-transcription_${today}`);

      try {
        await db.runTransaction(async (transaction) => {
          // 1. Check Overall Limit
          const globalPermDoc = await transaction.get(
            db.collection('global_permissions').doc('gemini-functions')
          );
          const globalPerm = globalPermDoc.data() as
            | GlobalPermission
            | undefined;
          const overallLimitEnabled =
            globalPerm?.config?.dailyLimitEnabled !== false;
          const overallLimit = globalPerm?.config?.dailyLimit ?? 20;

          const overallUsageDoc = await transaction.get(overallUsageRef);
          const currentOverallUsage =
            (overallUsageDoc.data()?.count as number) || 0;

          if (overallLimitEnabled && currentOverallUsage >= overallLimit) {
            throw new HttpsError(
              'resource-exhausted',
              `Daily AI usage limit reached (${overallLimit} generations). Please try again tomorrow.`
            );
          }

          // 2. Check Specific Transcription Limit
          const specLimitEnabled = perm.config?.dailyLimitEnabled !== false;
          const specLimit = perm.config?.dailyLimit ?? 5;

          const specUsageDoc = await transaction.get(specificUsageRef);
          const currentSpecUsage = (specUsageDoc.data()?.count as number) || 0;

          if (specLimitEnabled && currentSpecUsage >= specLimit) {
            throw new HttpsError(
              'resource-exhausted',
              `Daily audio transcription limit reached (${specLimit} per day). Please try again tomorrow.`
            );
          }

          // 3. Increment Both
          transaction.set(
            overallUsageRef,
            {
              count: currentOverallUsage + 1,
              email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          transaction.set(
            specificUsageRef,
            {
              count: currentSpecUsage + 1,
              email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error('Transcription usage check error:', error);
        throw new HttpsError(
          'internal',
          'Failed to verify audio transcription usage limits.'
        );
      }
    }

    const { url, questionCount } = data;
    const count = Math.min(Math.max(Number(questionCount) || 5, 1), 20);

    const videoIdMatch = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/
    );
    const videoId = videoIdMatch?.[1];

    if (!videoId) {
      throw new HttpsError(
        'invalid-argument',
        'Could not extract a video ID from the provided URL.'
      );
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError(
        'internal',
        'Gemini API Key is missing on the server.'
      );
    }

    // Use the YouTube video URL directly with Gemini's video understanding
    const model = perm.config?.model ?? 'gemini-3.1-flash-lite-preview';
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are an expert teacher creating a video comprehension activity.
Watch the provided YouTube video and generate exactly ${count} multiple-choice questions.

CRITICAL RULES:
1. Each question's "timestamp" field MUST be an integer (seconds from start) when the answer is discussed.
1b. Place each question timestamp near the END of the explanation segment so students hear the content before being prompted.
2. Questions must be in ascending timestamp order.
3. Each question must have exactly 3 plausible but incorrect answers.
4. Only use "MC" type.
5. Time limit should be 20-45 seconds per question.
6. Return ONLY valid JSON — no markdown fences, no commentary.

Return JSON:
{
  "title": "Short descriptive activity title",
  "questions": [
    {
      "text": "Question?",
      "timestamp": 42,
      "correctAnswer": "Correct answer",
      "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
      "timeLimit": 30
    }
  ]
}`;

    try {
      const result = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              {
                fileData: {
                  fileUri: `https://www.youtube.com/watch?v=${videoId}`,
                  mimeType: 'video/mp4',
                },
              },
            ],
          },
        ],
        config: { responseMimeType: 'application/json' },
      });

      const text = result.text;
      if (!text) throw new Error('Empty response from AI');

      const parsed = parseGeminiJson<GeneratedVideoActivity>(text);

      if (
        !parsed.title ||
        !Array.isArray(parsed.questions) ||
        parsed.questions.length === 0
      ) {
        throw new Error('Invalid response structure from AI');
      }

      return parsed;
    } catch (error: unknown) {
      console.error('[transcribeVideoWithGemini] Gemini error:', error);
      const detail = error instanceof Error ? error.message : 'unknown error';
      const msg = `AI generation failed (model: ${model}): ${detail}`;
      throw new HttpsError('internal', msg);
    }
  }
);

// ─── Guided Learning Generation (Admin Only) ─────────────────────────────────

interface GuidedLearningStep {
  id: string;
  xPct: number;
  yPct: number;
  imageIndex?: number;
  label?: string;
  interactionType: string;
  hideStepNumber?: boolean;
  showOverlay?: 'none' | 'popover' | 'tooltip' | 'banner';
  text?: string;
  panZoomScale?: number;
  spotlightRadius?: number;
  question?: {
    type: string;
    text: string;
    choices?: string[];
    correctAnswer?: string;
    matchingPairs?: { left: string; right: string }[];
    sortingItems?: string[];
  };
  autoAdvanceDuration?: number;
}

interface GeneratedGuidedLearning {
  suggestedTitle: string;
  suggestedMode: string;
  steps: GuidedLearningStep[];
}

interface GuidedLearningImageInput {
  base64: string;
  mimeType: string;
  caption?: string;
}

export const generateGuidedLearning = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [GEMINI_API_KEY],
  },
  async (request) => {
    const data = request.data as {
      images?: GuidedLearningImageInput[];
      prompt?: string;
      // Legacy single-image shape — accepted for backward compatibility.
      imageBase64?: string;
      mimeType?: string;
    };
    // Admin only
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Must be authenticated to use this feature.'
      );
    }

    const userEmail = request.auth?.token.email;
    if (!userEmail) {
      throw new HttpsError(
        'invalid-argument',
        'Authenticated user must have an email address.'
      );
    }
    const db = admin.firestore();
    const adminDoc = await db
      .collection('admins')
      .doc(userEmail.toLowerCase())
      .get();
    if (!adminDoc.exists) {
      throw new HttpsError(
        'permission-denied',
        'Admin access required to use AI generation.'
      );
    }

    const { prompt } = data;
    const images: GuidedLearningImageInput[] =
      Array.isArray(data.images) && data.images.length > 0
        ? data.images
        : data.imageBase64 && data.mimeType
          ? [{ base64: data.imageBase64, mimeType: data.mimeType }]
          : [];

    if (images.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'At least one image is required.'
      );
    }

    const MAX_IMAGES = 10;
    const MAX_TOTAL_RAW_BYTES = 20 * 1024 * 1024; // 20 MB raw (~27 MB base64)
    if (images.length > MAX_IMAGES) {
      throw new HttpsError(
        'invalid-argument',
        `Too many images — please limit to ${MAX_IMAGES} per request.`
      );
    }

    let totalRawBytes = 0;
    for (const img of images) {
      if (!img.base64 || !img.mimeType) {
        throw new HttpsError(
          'invalid-argument',
          'Every image must include base64 data and mimeType.'
        );
      }
      // Base64 decodes to ~0.75 bytes per char (minus padding).
      totalRawBytes += Math.ceil((img.base64.length * 3) / 4);
    }
    if (totalRawBytes > MAX_TOTAL_RAW_BYTES) {
      throw new HttpsError(
        'invalid-argument',
        'Image payload is too large. Please use fewer or smaller images (under 20 MB total).'
      );
    }

    const apiKey = GEMINI_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('internal', 'AI service is not configured.');
    }

    // Read model config from Firestore
    const geminiConfig = await getGeminiModelConfig(db);
    const guidedLearningModel = geminiConfig.advancedModel;

    try {
      const ai = new GoogleGenAI({ apiKey });

      const imageCount = images.length;
      const maxIndex = imageCount - 1;
      const systemInstruction = `You are an educational content creator helping teachers build interactive guided learning experiences.
Analyze the provided image(s) and generate a guided learning experience as a JSON object.

Return ONLY valid JSON with this exact structure:
{
  "suggestedTitle": "string",
  "suggestedMode": "structured" | "guided" | "explore",
  "steps": [
    {
      "id": "unique-string",
      "xPct": number (0-100),
      "yPct": number (0-100),
      "label": "string",
      "interactionType": "text-popover" | "tooltip" | "pan-zoom" | "spotlight" | "pan-zoom-spotlight" | "question",
      "imageIndex": number (0-based index into the provided images, 0..${maxIndex}),
      "hideStepNumber": boolean (optional),
      "showOverlay": "none" | "popover" | "tooltip" | "banner" (for pan-zoom, spotlight, pan-zoom-spotlight),
      "text": "string (for text-popover/tooltip)",
      "panZoomScale": number (1.5-4, for pan-zoom and pan-zoom-spotlight),
      "spotlightRadius": number (10-40, for spotlight and pan-zoom-spotlight),
      "autoAdvanceDuration": number (seconds),
      "question": {
        "type": "multiple-choice" | "matching" | "sorting",
        "text": "string",
        "choices": ["string"] (MC: include correct + 3 incorrect),
        "correctAnswer": "string (MC: must match one choice)",
        "matchingPairs": [{"left": "string", "right": "string"}],
        "sortingItems": ["string"] (in correct order)
      }
    }
  ]
}

Guidelines:
- You have been given ${imageCount} image${imageCount === 1 ? '' : 's'} (imageIndex ${imageCount === 1 ? '0' : `0..${maxIndex}`}).
- Each step's imageIndex MUST be the 0-based position of the image it refers to.
- Distribute steps across the images in a pedagogically meaningful order; do not cluster everything on image 0 unless only one image was provided.
- Respect any per-image notes the teacher provided (sent as text before each image).
- Create 4-8 meaningful steps per image that guide learners through the content (scale total step count with image count, cap at ~${Math.min(24, imageCount * 6)}).
- Use text-popover for key concepts, spotlight to highlight areas, pan-zoom to zoom in on details, pan-zoom-spotlight when both are useful, questions to check understanding.
- Place hotspots at meaningful locations on the image (xPct/yPct as percentages 0-100, relative to the image they reference).
- Include at least 1 question step for comprehension checking.
- Make content educational and age-appropriate.
- Set autoAdvanceDuration to 5-15 seconds for non-question steps in guided mode.`;

      const userPromptHeader = prompt
        ? `Additional instructions: ${sanitizePrompt(prompt)}`
        : 'Analyze the image(s) below and create an engaging guided learning experience.';

      const parts: {
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }[] = [{ text: userPromptHeader }];

      images.forEach((img, index) => {
        const caption = img.caption ? sanitizePrompt(img.caption) : '';
        const header = caption
          ? `Image ${index} notes: ${caption}`
          : `Image ${index}:`;
        parts.push({ text: header });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64,
          },
        });
      });

      const response = await ai.models.generateContent({
        model: guidedLearningModel,
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text ?? '';
      const parsed = parseGeminiJson<GeneratedGuidedLearning>(rawText);

      if (
        !parsed.suggestedTitle ||
        !Array.isArray(parsed.steps) ||
        parsed.steps.length === 0
      ) {
        throw new Error('Invalid response structure from AI');
      }

      // Ensure all steps have IDs and imageIndex values fall within range.
      parsed.steps = parsed.steps.map((step, i) => ({
        ...step,
        id: step.id || `step-${i + 1}-${Date.now()}`,
        imageIndex:
          typeof step.imageIndex === 'number' &&
          step.imageIndex >= 0 &&
          step.imageIndex <= maxIndex
            ? step.imageIndex
            : 0,
      }));

      return parsed;
    } catch (error: unknown) {
      console.error('[generateGuidedLearning] Gemini error:', error);
      const detail = error instanceof Error ? error.message : 'unknown error';
      const msg = `AI generation failed (model: ${guidedLearningModel}): ${detail}`;
      throw new HttpsError('internal', msg);
    }
  }
);

interface DashboardData {
  updatedAt?: number;
  widgets?: { type: string }[];
}

interface EngagementCounts {
  total: number;
  monthly: number;
  daily: number;
}

// registeredUsersCache removed – Auth data is now collected in a single
// listUsers pass that also provides MAU/DAU, so a separate cache is unnecessary.

/**
 * Cloud Function to fetch administrative analytics.
 * Uses onRequest with explicit CORS to avoid preflight issues with onCall.
 * Bumps memory and timeout to handle unbounded collection reads
 * while a more scalable (paginated/aggregated) solution is developed.
 */
export const adminAnalytics = onRequest(
  {
    memory: '4GiB',
    timeoutSeconds: 540,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (req, res) => {
    // Correlation id for log triage. Emitted on the response (body +
    // X-Request-Id header) and threaded through every `[getAdminAnalytics]`
    // log line so a Cloud Logging alert can be pivoted back to the exact
    // client-visible response.
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);

    // 1. Verify caller is authenticated via Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[getAdminAnalytics] Unauthenticated access attempt', {
        requestId,
      });
      res.status(401).json({ error: 'unauthenticated', requestId });
      return;
    }

    let email: string;
    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (!decodedToken.email) {
        res.status(401).json({ error: 'unauthenticated', requestId });
        return;
      }
      email = decodedToken.email.toLowerCase();
    } catch {
      res.status(401).json({ error: 'unauthenticated', requestId });
      return;
    }

    // 1b. Require an orgId in the request body so analytics can be scoped to
    // a single tenant. The previous behavior listed every Firebase Auth user
    // globally, which leaked foreign-domain accounts into the calling admin's
    // analytics view.
    const rawBody = req.body as { orgId?: unknown } | undefined;
    const orgId =
      rawBody && typeof rawBody.orgId === 'string' ? rawBody.orgId.trim() : '';
    if (!orgId) {
      res.status(400).json({
        error: 'invalid-argument',
        message: 'orgId is required',
        requestId,
      });
      return;
    }

    const db = admin.firestore();

    // 2. Verify caller is authorized for the requested org. Two paths:
    //   - Super admin: exists in `/admins/{email}`. May view any org.
    //   - Org admin: has a member doc at `/organizations/{orgId}/members/{email}`
    //     whose `roleId` is in the admin-tier set. Mirrors the role gating in
    //     `assertCallerIsOrgAdmin` (organizationInvites.ts) but also admits
    //     building_admin, since reading analytics is a lesser privilege than
    //     inviting members.
    const ORG_ADMIN_ROLE_IDS = new Set([
      'super_admin',
      'domain_admin',
      'building_admin',
    ]);
    const [adminDoc, memberDoc] = await Promise.all([
      db.collection('admins').doc(email).get(),
      db.doc(`organizations/${orgId}/members/${email}`).get(),
    ]);
    const memberData = memberDoc.exists
      ? (memberDoc.data() as { roleId?: unknown })
      : undefined;
    const memberRoleId =
      typeof memberData?.roleId === 'string' ? memberData.roleId.trim() : '';
    const isSuperAdmin = adminDoc.exists;
    const isOrgAdmin = memberDoc.exists && ORG_ADMIN_ROLE_IDS.has(memberRoleId);
    if (!isSuperAdmin && !isOrgAdmin) {
      console.error('[getAdminAnalytics] Unauthorized access', {
        requestId,
        email,
        orgId,
      });
      res.status(403).json({ error: 'permission-denied', requestId });
      return;
    }

    try {
      const now = Date.now();
      // 3a. Load the org's members as the authoritative user roster. This
      // replaces the previous global `listUsers()` scan, which pulled in every
      // Firebase Auth account regardless of org and caused foreign-domain
      // users to show up in a different org's analytics.
      //
      // For each member we need auth metadata (lastSignInTime) to compute
      // engagement. Members without a `uid` (invited but never signed in)
      // still count toward totals but have zero engagement.
      interface MemberLite {
        email: string;
        uid: string | null;
        buildingIds: string[];
      }
      const members: MemberLite[] = [];
      const membersSnap = await db
        .collection(`organizations/${orgId}/members`)
        .get();
      for (const doc of membersSnap.docs) {
        const data = doc.data() as {
          email?: unknown;
          uid?: unknown;
          buildingIds?: unknown;
        };
        const memberEmail =
          typeof data.email === 'string' ? data.email.toLowerCase() : doc.id;
        const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;
        const buildingIds = Array.isArray(data.buildingIds)
          ? data.buildingIds.filter(
              (id): id is string => typeof id === 'string' && id.length > 0
            )
          : [];
        members.push({ email: memberEmail, uid, buildingIds });
      }

      // Resolve Firebase Auth metadata for members that have a linked uid.
      // `getUsers()` tolerates up to 100 identifiers per call and silently
      // drops uids that no longer exist in Auth, which is the right behavior
      // for a member doc whose uid was revoked.
      const authUsersMap = new Map<
        string,
        { email: string; lastSignInMs: number }
      >();
      const uidsToResolve = members
        .map((m) => m.uid)
        .filter((uid): uid is string => uid !== null);
      for (let i = 0; i < uidsToResolve.length; i += 100) {
        const chunk = uidsToResolve.slice(i, i + 100).map((uid) => ({ uid }));
        if (chunk.length === 0) continue;
        try {
          const result = await admin.auth().getUsers(chunk);
          for (const u of result.users) {
            const lastSignIn = u.metadata.lastSignInTime
              ? new Date(u.metadata.lastSignInTime).getTime()
              : 0;
            authUsersMap.set(u.uid, {
              email: u.email ?? '',
              lastSignInMs: lastSignIn,
            });
          }
        } catch (err) {
          console.warn('[getAdminAnalytics] auth().getUsers() chunk failed', {
            requestId,
            orgId,
            chunkSize: chunk.length,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // 3b. Build a uid → member lookup so downstream dashboard/AI filters can
      // scope to org members without being gated on a successful
      // `auth().getUsers()` round-trip. `authUsersMap` is only used to join
      // lastSignIn metadata; an auth lookup failure must not silently drop a
      // real member's dashboards or AI usage from the totals.
      const memberUids = new Set<string>();
      for (const m of members) {
        if (m.uid) memberUids.add(m.uid);
      }

      // 3c. Time constants & helpers (engagement computed after dashboard
      //     stream so we can use last-edit timestamps instead of last-login)
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const oneDayMs = 24 * 60 * 60 * 1000;

      const increment = (
        bucket: Record<string, EngagementCounts>,
        key: string,
        isMonthlyActive: boolean,
        isDailyActive: boolean
      ) => {
        if (!bucket[key]) {
          bucket[key] = { total: 0, monthly: 0, daily: 0 };
        }
        bucket[key].total += 1;
        if (isMonthlyActive) bucket[key].monthly += 1;
        if (isDailyActive) bucket[key].daily += 1;
      };
      // 4. Fetch Dashboards for Widget Stats
      let totalDashboards = 0;
      const totalWidgetCounts: Record<string, number> = {};
      const activeWidgetCounts: Record<string, number> = {};
      const allDashboardOwnerUids = new Set<string>();
      let totalWidgetInstances = 0;
      // Bounded at MAX_WIDGET_USER_TRACK UIDs per type: memory is
      // O(widget_types × limit) instead of O(widget_types × all_users).
      // count = Set.size is exact up to the cap; above the cap it means "≥ cap".
      const MAX_WIDGET_USER_TRACK = 100;
      const widgetToUserUids: Record<string, Set<string>> = {};
      const activeThreshold = now - 30 * 24 * 60 * 60 * 1000; // 30 days
      // Track most recent dashboard edit per user for edit-based DAU/MAU
      const lastEditByUser = new Map<string, number>();

      const dashboardsStream = db
        .collectionGroup('dashboards')
        .select('widgets', 'updatedAt')
        .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

      for await (const dashDoc of dashboardsStream) {
        if (!dashDoc.exists) continue;
        const dashData = dashDoc.data() as DashboardData;
        const updatedAt =
          typeof dashData.updatedAt === 'number' ? dashData.updatedAt : 0;
        const isActive = updatedAt > activeThreshold;

        // Extract owner UID from path: users/{uid}/dashboards/{dashId}
        const ownerUid: string | null = dashDoc.ref.parent.parent?.id ?? null;

        // Skip dashboards not owned by a member of this org. Use the member
        // roster (not `authUsersMap`) so a transient `auth().getUsers()`
        // failure doesn't silently drop real members' dashboards from totals.
        if (!ownerUid || !memberUids.has(ownerUid)) continue;

        totalDashboards++;
        allDashboardOwnerUids.add(ownerUid);

        // Track the most recent edit across all of this user's dashboards
        const prevEdit = lastEditByUser.get(ownerUid) ?? 0;
        if (updatedAt > prevEdit) {
          lastEditByUser.set(ownerUid, updatedAt);
        }

        const widgetCount = Array.isArray(dashData.widgets)
          ? dashData.widgets.length
          : 0;
        totalWidgetInstances += widgetCount;

        if (dashData.widgets && Array.isArray(dashData.widgets)) {
          dashData.widgets.forEach((w: { type: string }) => {
            if (w && w.type) {
              totalWidgetCounts[w.type] = (totalWidgetCounts[w.type] || 0) + 1;
              if (isActive) {
                activeWidgetCounts[w.type] =
                  (activeWidgetCounts[w.type] || 0) + 1;
              }
              if (ownerUid) {
                if (!widgetToUserUids[w.type]) {
                  widgetToUserUids[w.type] = new Set<string>();
                }
                const uidSet = widgetToUserUids[w.type];
                // Only grow the Set while under the cap (or if already present)
                if (
                  uidSet.size < MAX_WIDGET_USER_TRACK ||
                  uidSet.has(ownerUid)
                ) {
                  uidSet.add(ownerUid);
                }
              }
            }
          });
        }
      }

      // 4b. Compute engagement using last-edit timestamps (not last-login)
      //     A user is "active" if they edited a dashboard within the window.
      const usersByDomain: Record<string, EngagementCounts> = {};
      const usersByBuilding: Record<string, EngagementCounts> = {};
      const usersByDomainAndBuilding: Record<
        string,
        Record<string, EngagementCounts>
      > = {};
      const totalEngagement: EngagementCounts = {
        total: 0,
        monthly: 0,
        daily: 0,
      };

      // Iterate the org member roster (not just the auth-resolved subset) so
      // invited-but-never-signed-in members count toward totals/domain/building
      // buckets with zero engagement, matching the "totals come from the
      // member roster; engagement is joined from Auth when available" contract.
      for (const member of members) {
        const userEmail = member.email;
        const domain = userEmail.includes('@')
          ? userEmail.split('@')[1]
          : 'unknown';
        const lastEditMs = member.uid
          ? (lastEditByUser.get(member.uid) ?? 0)
          : 0;
        const isMonthlyActive =
          lastEditMs > 0 && now - lastEditMs <= thirtyDaysMs;
        const isDailyActive = lastEditMs > 0 && now - lastEditMs <= oneDayMs;

        totalEngagement.total += 1;
        if (isMonthlyActive) totalEngagement.monthly += 1;
        if (isDailyActive) totalEngagement.daily += 1;

        increment(usersByDomain, domain, isMonthlyActive, isDailyActive);

        const buildings = member.buildingIds;
        if (buildings.length === 0) {
          increment(usersByBuilding, 'none', isMonthlyActive, isDailyActive);
          if (!usersByDomainAndBuilding[domain]) {
            usersByDomainAndBuilding[domain] = {};
          }
          increment(
            usersByDomainAndBuilding[domain],
            'none',
            isMonthlyActive,
            isDailyActive
          );
        } else {
          for (const building of buildings) {
            increment(
              usersByBuilding,
              building,
              isMonthlyActive,
              isDailyActive
            );
            if (!usersByDomainAndBuilding[domain]) {
              usersByDomainAndBuilding[domain] = {};
            }
            increment(
              usersByDomainAndBuilding[domain],
              building,
              isMonthlyActive,
              isDailyActive
            );
          }
        }
      }

      // 4c. Build per-user detail list for KPI drilldowns. Same rule: iterate
      // the member roster, join Auth metadata when a uid is present.
      const userList = members.map((member) => {
        const authInfo = member.uid ? authUsersMap.get(member.uid) : undefined;
        const lastSignInMs = authInfo?.lastSignInMs ?? 0;
        const lastEditMs = member.uid
          ? (lastEditByUser.get(member.uid) ?? 0)
          : 0;
        return {
          email: member.email,
          buildings: member.buildingIds,
          lastSignInMs,
          lastEditMs,
          hasDashboard: member.uid
            ? allDashboardOwnerUids.has(member.uid)
            : false,
          isMonthlyActive: lastEditMs > 0 && now - lastEditMs <= thirtyDaysMs,
          isDailyActive: lastEditMs > 0 && now - lastEditMs <= oneDayMs,
        };
      });

      // Auth data was already collected in step 3a – no separate scan needed
      const totalRegisteredUsers = authUsersMap.size;
      const registeredIsFallback = false;

      // Resolve widget UIDs to emails (cap at 200 unique UIDs total)
      const allWidgetUids = new Set<string>();
      outer: for (const uids of Object.values(widgetToUserUids)) {
        for (const uid of uids) {
          if (allWidgetUids.size >= 200) break outer;
          allWidgetUids.add(uid);
        }
      }

      const widgetUserEmails: Record<string, string> = {};
      const resolveUserEmailsViaAuthFallback = async (
        uids: string[],
        targetMap: Record<string, string>,
        warningContext: string
      ): Promise<void> => {
        const identifiers = uids.map((uid) => ({ uid }));
        for (let i = 0; i < identifiers.length; i += 100) {
          const chunk = identifiers.slice(i, i + 100);
          if (chunk.length === 0) continue;
          try {
            const result = await admin.auth().getUsers(chunk);
            result.users.forEach((u) => {
              if (u.email) {
                targetMap[u.uid] = u.email;
              }
            });
          } catch (error) {
            console.warn(
              `[getAdminAnalytics] Failed to resolve user emails via auth fallback for ${warningContext}`,
              {
                requestId,
                chunkSize: chunk.length,
                chunkStart: i,
                totalIdentifiers: identifiers.length,
                totalUids: uids.length,
                error,
              }
            );
          }
        }
      };
      const allWidgetUidArray = Array.from(allWidgetUids);
      for (let i = 0; i < allWidgetUidArray.length; i += 30) {
        const uidChunk = allWidgetUidArray.slice(i, i + 30);
        if (uidChunk.length === 0) continue;
        const snapshot = await db
          .collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', uidChunk)
          .select('email')
          .get();
        snapshot.docs.forEach((d) => {
          const userData = d.data();
          if (
            typeof userData['email'] === 'string' &&
            userData['email'].length > 0
          ) {
            widgetUserEmails[d.id] = userData['email'];
          }
        });
      }
      const unresolvedWidgetUids = allWidgetUidArray.filter(
        (uid) => !widgetUserEmails[uid]
      );
      if (unresolvedWidgetUids.length > 0) {
        await resolveUserEmailsViaAuthFallback(
          unresolvedWidgetUids,
          widgetUserEmails,
          'widget drilldowns'
        );
      }

      const usersByType: Record<string, { count: number; emails: string[] }> =
        {};
      for (const [widgetType, uidSet] of Object.entries(widgetToUserUids)) {
        usersByType[widgetType] = {
          count: uidSet.size,
          emails: Array.from(uidSet)
            .slice(0, 20)
            .map((uid) => widgetUserEmails[uid] ?? `Unknown (${uid})`)
            .sort(),
        };
      }
      // 5. Fetch AI Usage
      let totalAiCalls = 0;
      const callsPerUser: Record<string, number> = {};
      const dailyCallCounts: Record<string, number> = {};
      const aiCallsByFeature: Record<string, number> = {};

      const GEMINI_SPECIFIC_FEATURES = [
        'smart-poll',
        'embed-mini-app',
        'video-activity-audio-transcription',
        'quiz',
        'ocr',
        'guided-learning',
      ];

      const aiUsageStream = db
        .collection('ai_usage')
        .select('count')
        .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

      for await (const usageDoc of aiUsageStream) {
        if (!usageDoc.exists) continue;
        const idParts = usageDoc.id.split('_');
        if (idParts.length < 2) continue;

        const datePart = idParts[idParts.length - 1];
        const secondToLast = idParts[idParts.length - 2];
        const isSpecificFeature =
          GEMINI_SPECIFIC_FEATURES.includes(secondToLast);

        // Exclude the feature ID and date to get the original UID
        const uidParts = idParts.slice(0, isSpecificFeature ? -2 : -1);
        const uid = uidParts.join('_');

        if (!uid || !datePart) continue;

        // Skip AI usage not attributed to a member of this org. Scope by the
        // member roster rather than `authUsersMap` so auth lookup failures
        // don't silently drop members' AI calls from the totals.
        if (!memberUids.has(uid)) continue;

        const usageData = usageDoc.data();
        const count = typeof usageData.count === 'number' ? usageData.count : 0;

        if (isSpecificFeature) {
          aiCallsByFeature[secondToLast] =
            (aiCallsByFeature[secondToLast] ?? 0) + count;
        }

        // ONLY count the "overall" records for total analytics to avoid double counting
        // (Specific feature records are for enforcement, overall records track everything)
        if (!isSpecificFeature) {
          totalAiCalls += count;
          callsPerUser[uid] = (callsPerUser[uid] ?? 0) + count;
          dailyCallCounts[datePart] = (dailyCallCounts[datePart] ?? 0) + count;
        }
      }

      const uniqueDays = Object.keys(dailyCallCounts).length || 1;
      const avgDailyCalls = Math.round(totalAiCalls / uniqueDays);
      const activeAiUsers = Object.keys(callsPerUser).length || 1;
      const avgDailyCallsPerUser =
        Math.round((avgDailyCalls / activeAiUsers) * 10) / 10;
      const topUserUids = Object.entries(callsPerUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 25)
        .map(([uid]) => uid);
      const topUserEmails: Record<string, string> = {};

      for (let i = 0; i < topUserUids.length; i += 10) {
        const uidChunk = topUserUids.slice(i, i + 10);
        if (uidChunk.length === 0) continue;

        const usersSnapshot = await db
          .collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', uidChunk)
          .select('email')
          .get();

        usersSnapshot.docs.forEach((doc) => {
          const userData = doc.data();
          if (typeof userData.email === 'string' && userData.email.length > 0) {
            topUserEmails[doc.id] = userData.email;
          }
        });
      }
      const unresolvedTopUserUids = topUserUids.filter(
        (uid) => !topUserEmails[uid]
      );
      if (unresolvedTopUserUids.length > 0) {
        await resolveUserEmailsViaAuthFallback(
          unresolvedTopUserUids,
          topUserEmails,
          'AI top users'
        );
      }

      const topUsers = Object.entries(callsPerUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 25)
        .map(([uid, count]) => ({
          uid,
          count,
          email: topUserEmails[uid] ?? `Unknown (${uid})`,
        }));
      res.json({
        users: {
          total: totalEngagement.total,
          registered: totalRegisteredUsers,
          registeredIsFallback,
          monthly: totalEngagement.monthly,
          daily: totalEngagement.daily,
          withDashboards: allDashboardOwnerUids.size,
          domains: usersByDomain,
          buildings: usersByBuilding,
          domainBuilding: usersByDomainAndBuilding,
          userList,
        },
        widgets: {
          totalInstances: totalWidgetCounts,
          activeInstances: activeWidgetCounts,
          usersByType,
        },
        dashboards: {
          total: totalDashboards,
          avgWidgetsPerDashboard:
            totalDashboards > 0
              ? Math.round((totalWidgetInstances / totalDashboards) * 10) / 10
              : 0,
        },
        api: {
          totalCalls: totalAiCalls,
          activeUsers: Object.keys(callsPerUser).length,
          topUsers,
          avgDailyCalls,
          avgDailyCallsPerUser,
          byFeature: aiCallsByFeature,
        },
      });
    } catch (err: unknown) {
      console.error('[getAdminAnalytics] Error fetching analytics', {
        requestId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'An internal error occurred fetching analytics.';
      res
        .status(500)
        .json({ error: 'internal', message: errorMessage, requestId });
    }
  }
);

// ---------------------------------------------------------------------------
// Student identity (ClassLink-via-Google) — PII-free auth flow
// ---------------------------------------------------------------------------
//
// Students launch SpartBoard from their ClassLink LaunchPad tile. Because
// ClassLink is the district IdP and pushes identity into Google Workspace,
// the student is already signed in with Google on the Chromebook. We use
// Google Identity Services (GIS) client-side to obtain an ID token, verify
// it server-side, then look up the student in ClassLink OneRoster and mint
// a Firebase custom token whose UID is an HMAC pseudonym of the OneRoster
// sourcedId. Email / name / sub / sourcedId are never persisted.
//
// Intentional design choices:
//   - GIS + custom token (NOT signInWithPopup + GoogleAuthProvider) so that
//     the Firebase Auth user record never receives email/displayName/photoURL.
//   - Per-organization domain gating via existing
//     /organizations/{orgId}/domains subcollection; a login with a domain
//     not present (and verified) in any organization is rejected.
//   - Per-assignment pseudonym = HMAC(SECRET, uid + assignmentId) so the
//     server never needs the sourcedId after login. Teacher match-back
//     recomputes it from the OneRoster roster at grading time.
//   - NO PII logging. All catch blocks log class-of-failure only.

interface OneRosterUserWithRole extends ClassLinkUser {
  role?: string;
  roles?: Array<{ role?: string; roleType?: string }>;
}

const STUDENT_LOGIN_CLASS_IDS_MAX = 20;

function hmacSha256Hex(secret: string, message: string): string {
  return CryptoJS.HmacSHA256(message, secret).toString(CryptoJS.enc.Hex);
}

function computeStudentUid(sourcedId: string, hmacSecret: string): string {
  return hmacSha256Hex(hmacSecret, `sid:${sourcedId}`);
}

function computeAssignmentPseudonym(
  uid: string,
  assignmentId: string,
  hmacSecret: string
): string {
  return hmacSha256Hex(hmacSecret, `asn:${uid}:${assignmentId}`);
}

function normalizeEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return '@' + email.slice(at + 1).toLowerCase();
}

/**
 * Rejects emails that would break (or be injected into) an unquoted
 * OneRoster `filter=email='...'` string. Real Google-verified school emails
 * never contain `'` or `\`, so callers short-circuit to the standard
 * "not in roster" path rather than disclosing the guard's existence.
 */
function isSafeEmailForOneRosterFilter(email: string): boolean {
  return !/['\\]/.test(email);
}

/**
 * Looks up the organization that owns the given email domain. Matches against
 * the existing /organizations/{orgId}/domains/{doc} subcollection, requiring
 * `status === 'verified'`. Domain values in that collection are stored with a
 * leading '@' (e.g. '@orono.k12.mn.us'). Returns null if no match.
 */
async function resolveOrgIdForDomain(
  db: admin.firestore.Firestore,
  domainWithAt: string
): Promise<string | null> {
  const snap = await db
    .collectionGroup('domains')
    .where('domain', '==', domainWithAt)
    .where('status', '==', 'verified')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const orgRef = snap.docs[0].ref.parent.parent;
  return orgRef ? orgRef.id : null;
}

function isOneRosterStudent(user: OneRosterUserWithRole): boolean {
  if (user.role && user.role.toLowerCase() === 'student') return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => {
      const v = (r.role ?? r.roleType ?? '').toLowerCase();
      return v === 'student' || v === 'primary';
    });
  }
  return false;
}

/**
 * studentLoginV1
 *
 * Input:  { idToken: string }  — Google ID token from GIS on the client.
 * Output: { customToken, orgId, classCount } — client then calls
 *         signInWithCustomToken(customToken).
 *
 * Failure codes:
 *   - unauthenticated / invalid-argument: ID token missing or invalid.
 *   - permission-denied: email domain not registered with any organization.
 *   - not-found: student email not present in ClassLink OneRoster, or no
 *                classes enrolled, or account role is not 'student'.
 *   - internal: ClassLink API unreachable or server misconfigured.
 */
export const studentLoginV1 = onCall(
  {
    memory: '256MiB',
    minInstances: 1,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
      GOOGLE_OAUTH_CLIENT_ID,
    ],
    invoker: 'public',
  },
  async (request) => {
    const rawIdToken = (request.data as { idToken?: unknown })?.idToken;
    const idToken = typeof rawIdToken === 'string' ? rawIdToken : '';
    if (!idToken) {
      throw new HttpsError('invalid-argument', 'Missing idToken.');
    }

    const googleClientId = GOOGLE_OAUTH_CLIENT_ID.value();
    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (
      !googleClientId ||
      !hmacSecret ||
      !classlinkClientId ||
      !classlinkClientSecret ||
      !tenantUrl
    ) {
      console.error(
        '[studentLoginV1] Missing required server configuration (secrets).'
      );
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    // 1. Verify the Google ID token signature and audience. The library also
    //    validates `iss`, `exp`, and our expected `aud` in one call.
    const oauthClient = new OAuth2Client();
    let email: string;
    let hd: string | undefined;
    let emailVerified: boolean;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('no-payload');
      }
      email = typeof payload.email === 'string' ? payload.email : '';
      hd = typeof payload.hd === 'string' ? payload.hd : undefined;
      emailVerified = payload.email_verified === true;
    } catch {
      // Do not log token contents.
      console.warn('[studentLoginV1] ID token verification failed.');
      throw new HttpsError('unauthenticated', 'Invalid identity token.');
    }
    if (!email || !emailVerified) {
      throw new HttpsError('unauthenticated', 'Email not verified by Google.');
    }

    // 2. Organization / domain gate. Prefer the `hd` claim (Workspace-issued),
    //    but fall back to the email suffix since `hd` is not guaranteed on
    //    every Workspace configuration.
    const emailDomain = normalizeEmailDomain(email);
    if (!emailDomain) {
      throw new HttpsError('unauthenticated', 'Malformed email.');
    }
    const hdDomain = hd ? '@' + hd.toLowerCase() : null;

    const db = admin.firestore();
    let orgId = hdDomain ? await resolveOrgIdForDomain(db, hdDomain) : null;
    if (!orgId) {
      orgId = await resolveOrgIdForDomain(db, emailDomain);
    }
    if (!orgId) {
      // Counter for monitoring alert on misconfiguration / unregistered schools.
      console.warn('[studentLoginV1] students_rejected_domain');
      throw new HttpsError(
        'permission-denied',
        'This SpartBoard is only available to schools that have signed up.'
      );
    }

    // 2.5 Mock-class bypass. Admin-managed `testClasses` docs let us exercise
    //     the end-to-end student SSO flow without provisioning the student in
    //     ClassLink/OneRoster. If the email matches at least one testClasses
    //     doc under this org, we short-circuit and mint a custom token whose
    //     `classIds` are the testClasses doc ids — no OneRoster call is made.
    //     Test uids are namespaced (`test:email`) so they never collide with
    //     real OneRoster `sourcedId`-derived uids.
    const emailLower = email.toLowerCase();
    const testClassSnap = await db
      .collection(`organizations/${orgId}/testClasses`)
      .where('memberEmails', 'array-contains', emailLower)
      .limit(STUDENT_LOGIN_CLASS_IDS_MAX)
      .get();
    if (!testClassSnap.empty) {
      // Query is already bounded by `.limit(STUDENT_LOGIN_CLASS_IDS_MAX)` —
      // no secondary slice needed.
      const mockClassIds = testClassSnap.docs.map((d) => d.id);
      // Monitoring counter — surface any prod use of the bypass.
      console.warn('[studentLoginV1] test_bypass_used', { orgId });
      const uid = computeStudentUid(`test:${emailLower}`, hmacSecret);
      try {
        const customToken = await admin.auth().createCustomToken(uid, {
          studentRole: true,
          orgId,
          classIds: mockClassIds,
        });
        return { customToken, orgId, classCount: mockClassIds.length };
      } catch (err) {
        console.error(
          '[studentLoginV1] createCustomToken failed (test bypass):',
          err
        );
        throw new HttpsError('internal', 'Failed to mint auth token.');
      }
    }

    // 3. ClassLink OneRoster lookup — fetch the student's sourcedId and
    //    classes. Held in memory only, never written to Firestore.
    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');
    let sourcedId: string;
    let classIds: string[];
    try {
      if (!isSafeEmailForOneRosterFilter(email)) {
        console.warn('[studentLoginV1] students_not_in_roster');
        throw new HttpsError(
          'not-found',
          'No student record found in ClassLink roster.'
        );
      }
      const usersBaseUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users`;
      const userParams = { filter: `email='${email}'` };
      const userHeaders = getOAuthHeaders(
        usersBaseUrl,
        userParams,
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const userResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
        usersBaseUrl,
        { params: userParams, headers: { ...userHeaders } }
      );
      const users = userResp.data.users ?? [];
      const studentUser = users.find(isOneRosterStudent);
      if (!studentUser) {
        console.warn('[studentLoginV1] students_not_in_roster');
        throw new HttpsError(
          'not-found',
          'No student record found in ClassLink roster.'
        );
      }
      sourcedId = studentUser.sourcedId;

      const classesUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users/${sourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const classesResp = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      classIds = (classesResp.data.classes ?? [])
        .map((c) => c.sourcedId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (axios.isAxiosError(err)) {
        console.error(
          '[studentLoginV1] ClassLink request failed:',
          err.response?.status
        );
      } else {
        console.error('[studentLoginV1] ClassLink request failed.');
      }
      throw new HttpsError('internal', 'Roster service unavailable.');
    }

    // 4. Compute the stable opaque UID and mint the custom token with
    //    the classIds claim that gates Firestore reads.
    const uid = computeStudentUid(sourcedId, hmacSecret);

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(uid, {
        studentRole: true,
        orgId,
        classIds,
      });
    } catch (err) {
      console.error('[studentLoginV1] createCustomToken failed:', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    return { customToken, orgId, classCount: classIds.length };
  }
);

/**
 * getAssignmentPseudonymV1
 *
 * Called by the authenticated student client when opening a specific
 * assignment. Returns the opaque pseudonym to write into the response doc:
 *
 *   pseudonym = HMAC_SHA256(HMAC_SECRET, "asn:" + uid + ":" + assignmentId)
 *
 * Stable within (uid, assignmentId), unlinkable across assignments, and
 * unlinkable to a student without both the HMAC secret AND the OneRoster
 * roster.
 */
export const getAssignmentPseudonymV1 = onCall(
  {
    memory: '128MiB',
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
    invoker: 'public',
  },
  (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }
    const rawAssignmentId = (request.data as { assignmentId?: unknown })
      ?.assignmentId;
    const assignmentId =
      typeof rawAssignmentId === 'string' ? rawAssignmentId : '';
    if (!assignmentId || assignmentId.length > 200) {
      throw new HttpsError('invalid-argument', 'Invalid assignmentId.');
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    const pseudonym = computeAssignmentPseudonym(
      request.auth.uid,
      assignmentId,
      hmacSecret
    );
    return { pseudonym };
  }
);

/**
 * getStudentClassDirectoryV1
 *
 * Returns class metadata (name, teacher display name, subject, code) for the
 * authenticated student's claim-bound `classIds`. Powers the sidebar on
 * `/my-assignments` so a student sees "English 9 / Ms. Halverson" instead of
 * an opaque sourcedId.
 *
 * Lookup order per classId:
 *   1. `collectionGroup('rosters').where('classlinkClassId', '==', classId)` —
 *      real ClassLink imports. Parent path gives teacher uid. Safe across
 *      orgs because ClassLink-issued sourcedIds are not admin-controlled.
 *   2. `organizations/{orgId}/testClasses/{classId}` — admin-managed test
 *      classes. Always read via the org-scoped doc path (never via a
 *      collectionGroup lookup on `testClassId`) because test class IDs are
 *      admin-chosen slugs that can collide across orgs; a collectionGroup
 *      query would risk returning another org's roster.
 *
 * PII: this function never returns student names, emails, or any field from
 * the per-roster Drive file. Only Firestore-side roster meta (which is
 * itself PII-free) plus the teacher's own `displayName` from Firebase Auth.
 * Teacher names are organizational data, not student PII.
 *
 * Failure: classIds that match nothing are silently dropped from the
 * response so the sidebar simply omits them. The page renders a fallback
 * label client-side rather than treating a missing entry as an error.
 */
export const getStudentClassDirectoryV1 = onCall(
  {
    memory: '256MiB',
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    if (request.auth.token.studentRole !== true) {
      throw new HttpsError('permission-denied', 'Student role required.');
    }

    const rawClassIds: unknown = request.auth.token.classIds;
    if (!Array.isArray(rawClassIds)) {
      throw new HttpsError('failed-precondition', 'No classes on token.');
    }
    const classIds = rawClassIds
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .slice(0, STUDENT_LOGIN_CLASS_IDS_MAX);
    if (classIds.length === 0) {
      return { classes: [] };
    }

    const orgId =
      typeof request.auth.token.orgId === 'string'
        ? request.auth.token.orgId
        : '';

    const db = admin.firestore();

    // Per-call cache: many classes may share a teacher; one Auth lookup
    // suffices.
    const teacherNameCache = new Map<string, string>();
    const resolveTeacherName = async (teacherUid: string): Promise<string> => {
      const cached = teacherNameCache.get(teacherUid);
      if (cached !== undefined) return cached;
      try {
        const user = await admin.auth().getUser(teacherUid);
        const displayName =
          (typeof user.displayName === 'string' && user.displayName) ||
          (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
          '';
        teacherNameCache.set(teacherUid, displayName);
        return displayName;
      } catch {
        // Auth lookup can fail for legacy / deleted teacher accounts. Caller
        // falls back to an empty teacher name; the row still renders.
        teacherNameCache.set(teacherUid, '');
        return '';
      }
    };

    interface DirectoryEntry {
      classId: string;
      name: string;
      teacherDisplayName: string;
      subject?: string;
      code?: string;
    }

    // Batch the per-classId collectionGroup queries instead of fanning out
    // a separate equality query per id. Firestore caps `in`-array size at
    // 30; we chunk at 10 to stay safely under the limit and to fit the
    // typical `STUDENT_LOGIN_CLASS_IDS_MAX = 20` payload in 2 chunks.
    const FIRESTORE_IN_CHUNK_SIZE = 10;
    const chunk = <T>(arr: readonly T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    /**
     * Run `collectionGroup('rosters').where(field, 'in', chunk)` for every
     * chunk of `ids`, then index the matching roster docs by their
     * `field`-value. First match wins on duplicates so the teacher whose
     * roster Firestore returns first deterministically owns the directory
     * entry for that class.
     */
    const batchLookupByField = async (
      field: 'classlinkClassId',
      ids: readonly string[]
    ): Promise<Map<string, FirebaseFirestore.QueryDocumentSnapshot>> => {
      const out = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      if (ids.length === 0) return out;
      const snapshots = await Promise.all(
        chunk(ids, FIRESTORE_IN_CHUNK_SIZE).map((idChunk) =>
          db.collectionGroup('rosters').where(field, 'in', idChunk).get()
        )
      );
      for (const snap of snapshots) {
        for (const doc of snap.docs) {
          const value: unknown = doc.get(field);
          if (typeof value === 'string' && !out.has(value)) {
            out.set(value, doc);
          }
        }
      }
      return out;
    };

    const buildEntryFromRoster = async (
      classId: string,
      rosterDoc: FirebaseFirestore.QueryDocumentSnapshot,
      includeCode: boolean
    ): Promise<DirectoryEntry> => {
      const data = rosterDoc.data();
      const teacherUid = rosterDoc.ref.parent.parent?.id ?? '';
      const teacherDisplayName = teacherUid
        ? await resolveTeacherName(teacherUid)
        : '';
      return {
        classId,
        name: typeof data.name === 'string' ? data.name : classId,
        teacherDisplayName,
        subject:
          typeof data.classlinkSubject === 'string'
            ? data.classlinkSubject
            : undefined,
        code:
          includeCode && typeof data.classlinkClassCode === 'string'
            ? data.classlinkClassCode
            : undefined,
      };
    };

    // 1. Batched collectionGroup lookup for ClassLink classes. Two `in`
    // queries per field chunk replace what was up to 20 separate equality
    // queries. Real ClassLink sourcedIds are issued globally by ClassLink
    // and are not admin-controlled, so collisions across orgs are not a
    // realistic risk on this branch.
    const classlinkMatches = await batchLookupByField(
      'classlinkClassId',
      classIds
    );
    const unresolvedAfterClasslink = classIds.filter(
      (id) => !classlinkMatches.has(id)
    );

    // 2. Direct testClasses doc reads — for every classId not resolved as
    // ClassLink. We deliberately do NOT use a `collectionGroup('rosters')
    // .where('testClassId', 'in', …)` lookup here: testClassIds are
    // admin-chosen slugs (default `testclass`, or a slugified title) and
    // can collide across orgs, so a collectionGroup query would risk
    // returning another org's roster doc and leaking that teacher's name
    // and class metadata to the student. The org-scoped document path is
    // gated by the student's verified `orgId` claim, so it cannot cross
    // org boundaries. The trade-off is that we no longer surface the
    // importing teacher's display name on test-class directory entries —
    // these are admin-managed mocks where teacher attribution is
    // cosmetic.
    const testClassDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    if (orgId && unresolvedAfterClasslink.length > 0) {
      const docs = await Promise.all(
        unresolvedAfterClasslink.map((id) =>
          db
            .doc(`organizations/${orgId}/testClasses/${id}`)
            .get()
            .catch(() => null)
        )
      );
      for (let i = 0; i < unresolvedAfterClasslink.length; i++) {
        const d = docs[i];
        if (d && d.exists) testClassDocs.set(unresolvedAfterClasslink[i], d);
      }
    }

    const entries = await Promise.all(
      classIds.map(async (classId): Promise<DirectoryEntry | null> => {
        const fromClasslink = classlinkMatches.get(classId);
        if (fromClasslink) {
          return buildEntryFromRoster(classId, fromClasslink, true);
        }
        const fromTestClassDoc = testClassDocs.get(classId);
        if (fromTestClassDoc) {
          const data = fromTestClassDoc.data() ?? {};
          return {
            classId,
            name:
              typeof data.title === 'string' && data.title.length > 0
                ? data.title
                : classId,
            teacherDisplayName: '',
            subject:
              typeof data.subject === 'string' ? data.subject : undefined,
          };
        }
        return null;
      })
    );

    const classes = entries.filter((e): e is DirectoryEntry => e !== null);
    return { classes };
  }
);

/**
 * getPseudonymsForAssignmentV1
 *
 * Called by a teacher's client when rendering the grading view for an
 * assignment. Returns both pseudonyms plus names for every student in the
 * targeted ClassLink class:
 *   { sourcedId -> { studentUid, assignmentPseudonym, givenName, familyName } }
 * so the teacher's client can join Firestore responses (keyed by either the
 * session-scoped studentUid for quiz/video/guided-learning or the
 * assignment-scoped pseudonym for mini-app submissions) back to roster
 * identity and display names. Names never touch Firestore — they stay in
 * teacher-browser memory for the session. The HMAC secret never leaves the
 * server.
 *
 * Only callable by a teacher who actually teaches the requested class
 * (ClassLink membership is re-verified on every call).
 */
export const getPseudonymsForAssignmentV1 = onCall(
  {
    memory: '256MiB',
    minInstances: 1,
    secrets: [
      CLASSLINK_CLIENT_ID,
      CLASSLINK_CLIENT_SECRET,
      CLASSLINK_TENANT_URL,
      STUDENT_PSEUDONYM_HMAC_SECRET,
    ],
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    // Teachers authenticate with standard Firebase Auth (email present on
    // token). Students never have email on their token, so this also keeps
    // students out of the teacher-only endpoint.
    const teacherEmail = request.auth.token.email;
    if (!teacherEmail || request.auth.token.studentRole === true) {
      throw new HttpsError('permission-denied', 'Teacher account required.');
    }

    const data = request.data as {
      assignmentId?: unknown;
      classId?: unknown;
      orgId?: unknown;
    };
    const assignmentId =
      typeof data?.assignmentId === 'string' ? data.assignmentId : '';
    const classId = typeof data?.classId === 'string' ? data.classId : '';
    // orgId is optional for backwards compatibility (older clients). The
    // test-class branch only activates when it's provided AND the requested
    // classId resolves to a `testClasses` doc under that org.
    const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
    if (!assignmentId || !classId) {
      throw new HttpsError(
        'invalid-argument',
        'assignmentId and classId are required.'
      );
    }

    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    const classlinkClientId = CLASSLINK_CLIENT_ID.value();
    const classlinkClientSecret = CLASSLINK_CLIENT_SECRET.value();
    const tenantUrl = CLASSLINK_TENANT_URL.value();
    if (
      !hmacSecret ||
      !classlinkClientId ||
      !classlinkClientSecret ||
      !tenantUrl
    ) {
      throw new HttpsError('internal', 'Server configuration missing.');
    }

    // ── Test-class branch ────────────────────────────────────────────────
    // Test classes (admin-managed mocks under `organizations/{orgId}/testClasses`)
    // bypass ClassLink entirely. Their students log in via the `studentLoginV1`
    // test bypass, which mints UIDs as `HMAC("sid:test:{emailLower}", secret)`.
    // ClassLink OneRoster has no record of them, so the standard branch returns
    // an empty pseudonym map and the teacher monitor falls back to "Student".
    // This branch resolves names from the `memberEmails` array on the test-class
    // doc, using the email local-part as the display name (matching what
    // `materializeTestClassStudents` shows in the import dialog).
    if (orgId) {
      const db = admin.firestore();
      const teacherEmailLower = teacherEmail.toLowerCase();
      const memberRef = db.doc(
        `organizations/${orgId}/members/${teacherEmailLower}`
      );
      const memberSnap = await memberRef.get();
      if (!memberSnap.exists) {
        throw new HttpsError(
          'permission-denied',
          'Not a member of this organization.'
        );
      }

      const testClassRef = db.doc(
        `organizations/${orgId}/testClasses/${classId}`
      );
      const testClassSnap = await testClassRef.get();
      if (testClassSnap.exists) {
        // Authorize: teacher must own a roster whose `testClassId` matches.
        // Roster metadata lives in Firestore (no Drive read needed for this
        // gate). Same trust model as the ClassLink branch's "teaches this
        // class" check, but anchored to the teacher's own roster ownership.
        const ownedRosters = await db
          .collection(`users/${request.auth.uid}/rosters`)
          .where('testClassId', '==', classId)
          .limit(1)
          .get();
        if (ownedRosters.empty) {
          throw new HttpsError(
            'permission-denied',
            'Not a teacher of this test class.'
          );
        }

        const testClassData = (testClassSnap.data() ?? {}) as {
          memberEmails?: unknown;
        };
        const memberEmails = Array.isArray(testClassData.memberEmails)
          ? testClassData.memberEmails.filter(
              (e): e is string => typeof e === 'string' && e.length > 0
            )
          : [];

        const pseudonyms: Record<
          string,
          {
            studentUid: string;
            assignmentPseudonym: string;
            givenName: string;
            familyName: string;
          }
        > = {};
        for (const rawEmail of memberEmails) {
          const emailLower = rawEmail.toLowerCase();
          // Mirrors `studentLoginV1` test-bypass UID minting at
          // functions/src/index.ts ~2868: HMAC over "sid:test:{emailLower}".
          const studentUid = computeStudentUid(
            `test:${emailLower}`,
            hmacSecret
          );
          // Display name = email local-part. This matches what the import
          // dialog already shows (`materializeTestClassStudents` line 66:
          // `firstName: email.split('@')[0]`), so the monitor view stays
          // consistent with the roster.
          const localPart = emailLower.split('@')[0] || emailLower;
          // Key by the lowercased email (no `sourcedId` exists for test
          // students). The client-side hook only iterates `Object.values`
          // and re-keys by `studentUid`, so the key choice is internal.
          pseudonyms[emailLower] = {
            studentUid,
            assignmentPseudonym: computeAssignmentPseudonym(
              studentUid,
              assignmentId,
              hmacSecret
            ),
            givenName: localPart,
            familyName: '',
          };
        }
        return { pseudonyms };
      }
    }

    const cleanTenantUrl = tenantUrl.replace(/\/$/, '');

    // Verify the teacher actually teaches this class before disclosing the
    // roster pseudonyms. A teacher can only retrieve pseudonyms for their
    // own classes.
    try {
      if (!isSafeEmailForOneRosterFilter(teacherEmail)) {
        throw new HttpsError(
          'not-found',
          'Teacher not found in ClassLink roster.'
        );
      }
      const teacherUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users`;
      const teacherParams = { filter: `email='${teacherEmail}'` };
      const teacherHeaders = getOAuthHeaders(
        teacherUrl,
        teacherParams,
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const teacherResp = await axios.get<{ users: OneRosterUserWithRole[] }>(
        teacherUrl,
        { params: teacherParams, headers: { ...teacherHeaders } }
      );
      const teacherUser = (teacherResp.data.users ?? [])[0];
      if (!teacherUser) {
        throw new HttpsError(
          'not-found',
          'Teacher not found in ClassLink roster.'
        );
      }
      const classesUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/users/${teacherUser.sourcedId}/classes`;
      const classesHeaders = getOAuthHeaders(
        classesUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const classesResp = await axios.get<{ classes: ClassLinkClass[] }>(
        classesUrl,
        { headers: { ...classesHeaders } }
      );
      const teaches = (classesResp.data.classes ?? []).some(
        (c) => c.sourcedId === classId
      );
      if (!teaches) {
        throw new HttpsError(
          'permission-denied',
          'Not a teacher of this class.'
        );
      }

      // Now fetch the class's students and compute the pseudonym map.
      const studentsUrl = `${cleanTenantUrl}/ims/oneroster/v1p1/classes/${classId}/students`;
      const studentsHeaders = getOAuthHeaders(
        studentsUrl,
        {},
        'GET',
        classlinkClientId,
        classlinkClientSecret
      );
      const studentsResp = await axios.get<{ users: ClassLinkStudent[] }>(
        studentsUrl,
        { headers: { ...studentsHeaders } }
      );
      const students = studentsResp.data.users ?? [];

      // Return both pseudonyms so teacher viewers can match whichever one
      // the response doc is keyed by:
      //  - studentUid            — HMAC(sourcedId, secret); equals the
      //                            ClassLink student's Firebase Auth UID.
      //                            Used by quiz/video-activity/guided-learning
      //                            response docs that key on auth.currentUser.uid.
      //  - assignmentPseudonym   — HMAC(studentUid + assignmentId, secret).
      //                            Used by mini-app submission docs that key
      //                            on a per-assignment opaque id.
      const pseudonyms: Record<
        string,
        {
          studentUid: string;
          assignmentPseudonym: string;
          givenName: string;
          familyName: string;
        }
      > = {};
      for (const s of students) {
        if (!s.sourcedId) continue;
        const studentUid = computeStudentUid(s.sourcedId, hmacSecret);
        pseudonyms[s.sourcedId] = {
          studentUid,
          assignmentPseudonym: computeAssignmentPseudonym(
            studentUid,
            assignmentId,
            hmacSecret
          ),
          givenName: s.givenName ?? '',
          familyName: s.familyName ?? '',
        };
      }
      return { pseudonyms };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (axios.isAxiosError(err)) {
        console.error(
          '[getPseudonymsForAssignmentV1] ClassLink request failed:',
          err.response?.status
        );
      } else {
        console.error('[getPseudonymsForAssignmentV1] Unexpected failure.');
      }
      throw new HttpsError('internal', 'Roster service unavailable.');
    }
  }
);
