import * as functionsV1 from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import * as CryptoJS from 'crypto-js';
import { GoogleGenAI, Content } from '@google/genai';
import { sanitizePrompt } from './sanitize';
import cors from 'cors';

const ALLOWED_ORIGINS = [
  'https://spartboard.web.app',
  'https://spartboard.firebaseapp.com',
  /^https:\/\/spartboard--[\w-]+\.web\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const corsHandler = cors({ origin: ALLOWED_ORIGINS });
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
    | 'widget-explainer';
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

interface ArchiveActivityWallPhotoData {
  accessToken?: string;
  sessionId?: string;
  submissionId?: string;
  activityId?: string;
  status?: 'approved' | 'pending';
}

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const APP_DRIVE_FOLDER = 'SPART Board';

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

// Keep ClassLink on v1 for now as it's working
export const getClassLinkRosterV1 = functionsV1
  .runWith({
    secrets: [
      'CLASSLINK_CLIENT_ID',
      'CLASSLINK_CLIENT_SECRET',
      'CLASSLINK_TENANT_URL',
    ],
    memory: '256MB',
  })
  .https.onCall(
    async (data: unknown, context: functionsV1.https.CallableContext) => {
      if (!context.auth) {
        throw new functionsV1.https.HttpsError(
          'unauthenticated',
          'The function must be called while authenticated.'
        );
      }

      const userEmail = context.auth.token.email;
      if (!userEmail) {
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'User must have an email associated with their account.'
        );
      }

      const clientId = process.env.CLASSLINK_CLIENT_ID;
      const clientSecret = process.env.CLASSLINK_CLIENT_SECRET;
      const tenantUrl = process.env.CLASSLINK_TENANT_URL;

      if (!clientId || !clientSecret || !tenantUrl) {
        throw new functionsV1.https.HttpsError(
          'internal',
          'ClassLink configuration is missing on the server.'
        );
      }

      const cleanTenantUrl = tenantUrl.replace(/\/$/, '');

      try {
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
              studentsByClass[cls.sourcedId] =
                studentsResponse.data.users ?? [];
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
          throw new functionsV1.https.HttpsError(
            'internal',
            `Failed to fetch data from ClassLink: ${axiosError.message}`
          );
        }
        throw new functionsV1.https.HttpsError(
          'internal',
          'Failed to fetch data from ClassLink'
        );
      }
    }
  );

// Use v1 for generateWithAI to match the client SDK's expected URL format and ensure reliable CORS
export const generateWithAI = functionsV1
  .runWith({
    secrets: ['GEMINI_API_KEY'],
    memory: '512MB',
  })
  .https.onCall(async (data: AIData, context) => {
    if (!context.auth) {
      throw new functionsV1.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;

    if (!email) {
      throw new functionsV1.https.HttpsError(
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

    if (!isAdmin) {
      // 1. Determine specific feature ID if applicable
      let specificFeatureId: string | null = null;
      const genType = String(data?.type || '')
        .toLowerCase()
        .trim();
      if (genType === 'mini-app') specificFeatureId = 'embed-mini-app';
      if (genType === 'poll') specificFeatureId = 'smart-poll';

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      try {
        await db.runTransaction(async (transaction) => {
          // --- Check Overall Gemini Limit ---
          const globalPermDoc = await transaction.get(
            db.collection('global_permissions').doc('gemini-functions')
          );
          const globalPerm = globalPermDoc.exists
            ? (globalPermDoc.data() as GlobalPermission)
            : null;

          if (globalPerm && !globalPerm.enabled) {
            throw new functionsV1.https.HttpsError(
              'permission-denied',
              'Gemini functions are currently disabled by an administrator.'
            );
          }

          if (globalPerm) {
            const { accessLevel, betaUsers = [] } = globalPerm;
            if (accessLevel === 'admin') {
              throw new functionsV1.https.HttpsError(
                'permission-denied',
                'Gemini functions are currently restricted to administrators.'
              );
            }
            if (
              accessLevel === 'beta' &&
              !betaUsers.includes(email.toLowerCase())
            ) {
              throw new functionsV1.https.HttpsError(
                'permission-denied',
                'You do not have access to Gemini beta functions.'
              );
            }
          }

          const overallLimitEnabled =
            globalPerm?.config?.dailyLimitEnabled !== false;
          const overallLimit = globalPerm?.config?.dailyLimit ?? 20;

          const overallUsageRef = db
            .collection('ai_usage')
            .doc(`${uid}_${today}`);
          const overallUsageDoc = await transaction.get(overallUsageRef);
          const currentOverallUsage = overallUsageDoc.exists
            ? (overallUsageDoc.data()?.count as number) || 0
            : 0;

          if (overallLimitEnabled && currentOverallUsage >= overallLimit) {
            throw new functionsV1.https.HttpsError(
              'resource-exhausted',
              `Daily AI usage limit reached (${overallLimit} generations). Please try again tomorrow.`
            );
          }

          // --- Check Specific Feature Limit ---
          let specificLimitReached = false;
          let specificLimit = 0;
          let specificUsageRef = null;
          let currentSpecificUsage = 0;

          if (specificFeatureId) {
            const specPermDoc = await transaction.get(
              db.collection('global_permissions').doc(specificFeatureId)
            );
            if (specPermDoc.exists) {
              const specPerm = specPermDoc.data() as GlobalPermission;
              const specLimitEnabled =
                specPerm.config?.dailyLimitEnabled !== false;
              specificLimit = specPerm.config?.dailyLimit ?? 20;

              if (specLimitEnabled) {
                specificUsageRef = db
                  .collection('ai_usage')
                  .doc(`${uid}_${specificFeatureId}_${today}`);
                const specUsageDoc = await transaction.get(specificUsageRef);
                currentSpecificUsage = specUsageDoc.exists
                  ? (specUsageDoc.data()?.count as number) || 0
                  : 0;

                if (currentSpecificUsage >= specificLimit) {
                  specificLimitReached = true;
                }
              }
            }
          }

          if (specificLimitReached) {
            throw new functionsV1.https.HttpsError(
              'resource-exhausted',
              `Daily limit for ${specificFeatureId} reached (${specificLimit} per day). Please try again tomorrow.`
            );
          }

          // --- Increment Both ---
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
        if (error instanceof functionsV1.https.HttpsError) {
          throw error;
        }
        console.error('Usage tracking error:', error);
        throw new functionsV1.https.HttpsError(
          'internal',
          'Failed to verify AI usage limits.'
        );
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('CRITICAL: GEMINI_API_KEY is missing');
      throw new functionsV1.https.HttpsError(
        'internal',
        'Gemini API Key is missing on the server.'
      );
    }

    try {
      const genType = String(data?.type || '')
        .toLowerCase()
        .trim();

      const ai = new GoogleGenAI({ apiKey });

      const sanitizedUserInput = sanitizePrompt(data?.prompt);

      const promptMap: Record<
        string,
        () => { systemPrompt: string; userPrompt: string }
      > = {
        'mini-app': () => ({
          systemPrompt: `
          You are an expert frontend developer. Create a single-file HTML/JS mini-app based on the user's request provided within <user_request> tags.
          Requirements:
          1. Single File (embedded CSS/JS).
          2. Use Tailwind CDN.
          3. Return JSON: { "title": "...", "html": "..." }
          4. IMPORTANT: If the app involves scoring, completion, or data entry, you MUST include JavaScript that sends results to the parent window using this EXACT format:
             window.parent.postMessage({ type: 'SPART_MINIAPP_RESULT', payload: { score: number, data: any } }, '*');
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
        throw new functionsV1.https.HttpsError(
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
      const model =
        genType === 'mini-app' || genType === 'widget-builder'
          ? 'gemini-3-flash-preview'
          : 'gemini-3.1-flash-lite-preview';

      const result = await ai.models.generateContent({
        model,
        contents,
        config: {
          // widget-builder and widget-explainer return plain text; all other types return JSON
          responseMimeType:
            genType === 'widget-builder' || genType === 'widget-explainer'
              ? 'text/plain'
              : 'application/json',
        },
      });

      const text = result.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      // widget-builder and widget-explainer return plain text — wrap in { result } for the client
      if (genType === 'widget-builder' || genType === 'widget-explainer') {
        return { result: text };
      }

      return JSON.parse(text) as Record<string, unknown>;
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

      const msg =
        error instanceof Error ? error.message : 'AI Generation failed';
      throw new functionsV1.https.HttpsError('internal', msg);
    }
  });

export const fetchWeatherProxy = functionsV1
  .runWith({
    memory: '128MB',
    timeoutSeconds: 30,
  })
  .https.onCall(async (data: { url: string }, context) => {
    if (!context.auth) {
      throw new functionsV1.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    try {
      const parsedUrl = new URL(data.url);
      if (
        parsedUrl.protocol !== 'https:' ||
        (parsedUrl.hostname !== 'api.openweathermap.org' &&
          parsedUrl.hostname !== 'owc.enterprise.earthnetworks.com')
      ) {
        throw new Error('Invalid host or protocol');
      }
    } catch {
      throw new functionsV1.https.HttpsError(
        'invalid-argument',
        'Invalid proxy URL. Only https://api.openweathermap.org and https://owc.enterprise.earthnetworks.com are allowed.'
      );
    }

    try {
      const response = await axios.get<unknown>(data.url);
      return response.data;
    } catch (error: unknown) {
      console.error('Weather Proxy Error:', error);
      const msg =
        error instanceof Error ? error.message : 'Weather fetch failed';
      throw new functionsV1.https.HttpsError('internal', msg);
    }
  });

export const archiveActivityWallPhoto = functionsV1
  .runWith({
    memory: '512MB',
    timeoutSeconds: 120,
  })
  .https.onCall(
    async (
      data: ArchiveActivityWallPhotoData,
      context: functionsV1.https.CallableContext
    ) => {
      if (!context.auth) {
        throw new functionsV1.https.HttpsError(
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
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'Missing required archive parameters.'
        );
      }

      if (!sessionId.startsWith(`${context.auth.uid}_`)) {
        throw new functionsV1.https.HttpsError(
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

        throw new functionsV1.https.HttpsError('internal', message);
      }
    }
  );

export const checkUrlCompatibility = functionsV1
  .runWith({
    memory: '128MB',
    timeoutSeconds: 20,
  })
  .https.onCall(async (data: { url: string }, context) => {
    if (!context.auth) {
      throw new functionsV1.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
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
  });

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
export const generateVideoActivity = functionsV1
  .region('us-central1')
  .runWith({
    secrets: ['GEMINI_API_KEY'],
    memory: '1GB',
    timeoutSeconds: 300,
  })
  .https.onCall(
    async (
      data: VideoActivityRequestData,
      context
    ): Promise<GeneratedVideoActivity> => {
      if (!context.auth) {
        throw new functionsV1.https.HttpsError(
          'unauthenticated',
          'The function must be called while authenticated.'
        );
      }

      const uid = context.auth.uid;
      const email = context.auth.token.email;

      if (!email) {
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'User must have an email associated with their account.'
        );
      }

      const { url, questionCount } = data;

      if (!url || typeof url !== 'string') {
        throw new functionsV1.https.HttpsError(
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
        throw new functionsV1.https.HttpsError(
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
        const overallUsageRef = db
          .collection('ai_usage')
          .doc(`${uid}_${today}`);

        try {
          await db.runTransaction(async (transaction) => {
            const globalPermDoc = await transaction.get(
              db.collection('global_permissions').doc('gemini-functions')
            );
            const globalPerm = globalPermDoc.data() as
              | GlobalPermission
              | undefined;

            if (globalPerm && !globalPerm.enabled) {
              throw new functionsV1.https.HttpsError(
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
              throw new functionsV1.https.HttpsError(
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
          if (error instanceof functionsV1.https.HttpsError) throw error;
          console.error('Usage check error:', error);
          throw new functionsV1.https.HttpsError(
            'internal',
            'Failed to verify AI usage limits.'
          );
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new functionsV1.https.HttpsError(
          'internal',
          'Gemini API Key is missing on the server.'
        );
      }

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
          model: 'gemini-3.1-flash-lite-preview',
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

        const parsed = JSON.parse(text) as GeneratedVideoActivity;

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
        const msg =
          error instanceof Error ? error.message : 'AI generation failed';
        throw new functionsV1.https.HttpsError('internal', msg);
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
export const transcribeVideoWithGemini = functionsV1
  .runWith({
    secrets: ['GEMINI_API_KEY'],
    memory: '1GB',
    timeoutSeconds: 300,
  })
  .https.onCall(
    async (
      data: AudioTranscriptionRequestData,
      context
    ): Promise<GeneratedVideoActivity> => {
      if (!context.auth) {
        throw new functionsV1.https.HttpsError(
          'unauthenticated',
          'The function must be called while authenticated.'
        );
      }

      const uid = context.auth.uid;
      const email = context.auth.token.email;

      if (!email) {
        throw new functionsV1.https.HttpsError(
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
        throw new functionsV1.https.HttpsError(
          'permission-denied',
          'Gemini audio transcription is not enabled. An administrator must enable it in Feature Permissions.'
        );
      }

      const perm = permDoc.data() as AudioTranscriptionPerm;

      if (!perm.enabled) {
        throw new functionsV1.https.HttpsError(
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
          throw new functionsV1.https.HttpsError(
            'permission-denied',
            'Gemini audio transcription is restricted to administrators.'
          );
        }
        if (
          perm.accessLevel === 'beta' &&
          !perm.betaUsers?.includes(email.toLowerCase())
        ) {
          throw new functionsV1.https.HttpsError(
            'permission-denied',
            'You do not have access to Gemini audio transcription.'
          );
        }
      }

      if (!isAdmin) {
        // --- Dual Limit Check (Overall + Specific) ---
        const today = new Date().toISOString().split('T')[0];
        const overallUsageRef = db
          .collection('ai_usage')
          .doc(`${uid}_${today}`);
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
              throw new functionsV1.https.HttpsError(
                'resource-exhausted',
                `Daily AI usage limit reached (${overallLimit} generations). Please try again tomorrow.`
              );
            }

            // 2. Check Specific Transcription Limit
            const specLimitEnabled = perm.config?.dailyLimitEnabled !== false;
            const specLimit = perm.config?.dailyLimit ?? 5;

            const specUsageDoc = await transaction.get(specificUsageRef);
            const currentSpecUsage =
              (specUsageDoc.data()?.count as number) || 0;

            if (specLimitEnabled && currentSpecUsage >= specLimit) {
              throw new functionsV1.https.HttpsError(
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
          if (error instanceof functionsV1.https.HttpsError) throw error;
          console.error('Transcription usage check error:', error);
          throw new functionsV1.https.HttpsError(
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
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'Could not extract a video ID from the provided URL.'
        );
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new functionsV1.https.HttpsError(
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

        const parsed = JSON.parse(text) as GeneratedVideoActivity;

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
        const msg =
          error instanceof Error ? error.message : 'AI generation failed';
        throw new functionsV1.https.HttpsError('internal', msg);
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

export const generateGuidedLearning = functionsV1
  .runWith({
    secrets: ['GEMINI_API_KEY'],
    memory: '512MB',
    timeoutSeconds: 120,
  })
  .https.onCall(
    async (
      data: { imageBase64: string; mimeType: string; prompt?: string },
      context
    ) => {
      // Admin only
      const uid = context.auth?.uid;
      if (!uid) {
        throw new functionsV1.https.HttpsError(
          'unauthenticated',
          'Must be authenticated to use this feature.'
        );
      }

      const userEmail = context.auth?.token.email;
      if (!userEmail) {
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'Authenticated user must have an email address.'
        );
      }
      const adminDoc = await admin
        .firestore()
        .collection('admins')
        .doc(userEmail.toLowerCase())
        .get();
      if (!adminDoc.exists) {
        throw new functionsV1.https.HttpsError(
          'permission-denied',
          'Admin access required to use AI generation.'
        );
      }

      const { imageBase64, mimeType, prompt } = data;
      if (!imageBase64 || !mimeType) {
        throw new functionsV1.https.HttpsError(
          'invalid-argument',
          'imageBase64 and mimeType are required.'
        );
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new functionsV1.https.HttpsError(
          'internal',
          'AI service is not configured.'
        );
      }

      try {
        const ai = new GoogleGenAI({ apiKey });

        const systemInstruction = `You are an educational content creator helping teachers build interactive guided learning experiences.
Analyze the provided image and generate a guided learning experience as a JSON object.

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
      "imageIndex": number (always 0 for now),
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
- Create 4-8 meaningful steps that guide learners through the content
- Use text-popover for key concepts, spotlight to highlight areas, pan-zoom to zoom in on details, pan-zoom-spotlight when both are useful, questions to check understanding
- This phase supports single-image AI generation only, so set imageIndex to 0 for every step
- Place hotspots at meaningful locations on the image (xPct/yPct as percentages 0-100)
- Include at least 1 question step for comprehension checking
- Make content educational and age-appropriate
- Set autoAdvanceDuration to 5-15 seconds for non-question steps in guided mode`;

        const userPrompt = prompt
          ? `Additional instructions: ${sanitizePrompt(prompt)}`
          : 'Analyze this educational image and create an engaging guided learning experience.';

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                { text: userPrompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text ?? '';
        const parsed = JSON.parse(rawText) as GeneratedGuidedLearning;

        if (
          !parsed.suggestedTitle ||
          !Array.isArray(parsed.steps) ||
          parsed.steps.length === 0
        ) {
          throw new Error('Invalid response structure from AI');
        }

        // Ensure all steps have IDs
        parsed.steps = parsed.steps.map((step, i) => ({
          ...step,
          id: step.id || `step-${i + 1}-${Date.now()}`,
        }));

        return parsed;
      } catch (error: unknown) {
        console.error('[generateGuidedLearning] Gemini error:', error);
        const msg =
          error instanceof Error ? error.message : 'AI generation failed';
        throw new functionsV1.https.HttpsError('internal', msg);
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
export const adminAnalytics = functionsV1
  .runWith({
    timeoutSeconds: 540,
    memory: '4GB',
  })
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      console.log('[getAdminAnalytics] Function started');

      // 1. Verify caller is authenticated via Bearer token
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        console.error('[getAdminAnalytics] Unauthenticated access attempt');
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }

      let email: string;
      try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!decodedToken.email) {
          res.status(401).json({ error: 'unauthenticated' });
          return;
        }
        email = decodedToken.email.toLowerCase();
      } catch {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }

      const db = admin.firestore();

      // 2. Verify caller is an admin
      console.log(`[getAdminAnalytics] Verifying admin status for: ${email}`);
      const adminDoc = await db.collection('admins').doc(email).get();
      if (!adminDoc.exists) {
        console.error(
          `[getAdminAnalytics] Unauthorized access: ${email} is not an admin`
        );
        res.status(403).json({ error: 'permission-denied' });
        return;
      }

      try {
        const now = Date.now();
        // 3a. Collect ALL user data from Firebase Auth (authoritative source
        // for MAU/DAU). This replaces the previous Firestore-only approach
        // which missed users without a /users/{uid} root doc.
        console.log('[getAdminAnalytics] Fetching users from Firebase Auth...');
        const authUsersMap = new Map<
          string,
          { email: string; lastSignInMs: number }
        >();
        let authPageToken: string | undefined;
        do {
          const listResult = await admin.auth().listUsers(1000, authPageToken);
          for (const u of listResult.users) {
            // Skip anonymous auth users (student accounts) — they have no
            // linked providers and no email, and should not appear in analytics.
            if (!u.email && u.providerData.length === 0) continue;

            const lastSignIn = u.metadata.lastSignInTime
              ? new Date(u.metadata.lastSignInTime).getTime()
              : 0;
            authUsersMap.set(u.uid, {
              email: u.email ?? '',
              lastSignInMs: lastSignIn,
            });
          }
          authPageToken = listResult.pageToken;
        } while (authPageToken);

        console.log(
          `[getAdminAnalytics] Found ${authUsersMap.size} Auth users`
        );

        // 3b. Stream Firestore /users/{uid} docs for building assignments only
        const buildingsMap = new Map<string, string[]>();
        const usersStream = db
          .collection('users')
          .select('buildings')
          .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

        for await (const userDoc of usersStream) {
          if (!userDoc.exists) continue;
          const userData = userDoc.data();
          if (
            Array.isArray(userData.buildings) &&
            userData.buildings.length > 0
          ) {
            buildingsMap.set(userDoc.id, userData.buildings.map(String));
          }
        }

        // 3c. Compute engagement from Auth data + buildings from Firestore
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

        for (const [uid, { email: userEmail, lastSignInMs }] of authUsersMap) {
          const domain = userEmail.includes('@')
            ? userEmail.split('@')[1]
            : 'unknown';
          const isMonthlyActive =
            lastSignInMs > 0 && now - lastSignInMs <= thirtyDaysMs;
          const isDailyActive =
            lastSignInMs > 0 && now - lastSignInMs <= oneDayMs;

          totalEngagement.total += 1;
          if (isMonthlyActive) totalEngagement.monthly += 1;
          if (isDailyActive) totalEngagement.daily += 1;

          increment(usersByDomain, domain, isMonthlyActive, isDailyActive);

          const buildings = buildingsMap.get(uid) ?? [];
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

        const totalUsers = authUsersMap.size;
        console.log(
          `[getAdminAnalytics] Computed engagement for ${totalUsers} users`
        );

        console.log(
          '[getAdminAnalytics] Fetching dashboards via collectionGroup...'
        );
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

        const dashboardsStream = db
          .collectionGroup('dashboards')
          .select('widgets', 'updatedAt')
          .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

        for await (const dashDoc of dashboardsStream) {
          if (!dashDoc.exists) continue;
          totalDashboards++;
          const dashData = dashDoc.data() as DashboardData;
          const updatedAt =
            typeof dashData.updatedAt === 'number' ? dashData.updatedAt : 0;
          const isActive = updatedAt > activeThreshold;

          // Extract owner UID from path: users/{uid}/dashboards/{dashId}
          const ownerUid: string | null = dashDoc.ref.parent.parent?.id ?? null;
          if (ownerUid) {
            allDashboardOwnerUids.add(ownerUid);
          }

          const widgetCount = Array.isArray(dashData.widgets)
            ? dashData.widgets.length
            : 0;
          totalWidgetInstances += widgetCount;

          if (dashData.widgets && Array.isArray(dashData.widgets)) {
            dashData.widgets.forEach((w: { type: string }) => {
              if (w && w.type) {
                totalWidgetCounts[w.type] =
                  (totalWidgetCounts[w.type] || 0) + 1;
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

        console.log(`[getAdminAnalytics] Found ${totalDashboards} dashboards`);

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

        console.log('[getAdminAnalytics] Fetching AI usage...');
        // 5. Fetch AI Usage
        let totalAiUsageRecords = 0;
        let totalAiCalls = 0;
        const callsPerUser: Record<string, number> = {};
        const dailyCallCounts: Record<string, number> = {};
        const aiCallsByFeature: Record<string, number> = {};

        const GEMINI_SPECIFIC_FEATURES = [
          'smart-poll',
          'embed-mini-app',
          'video-activity-audio-transcription',
        ];

        const aiUsageStream = db
          .collection('ai_usage')
          .select('count')
          .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

        for await (const usageDoc of aiUsageStream) {
          if (!usageDoc.exists) continue;
          totalAiUsageRecords++;
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

          const usageData = usageDoc.data();
          const count =
            typeof usageData.count === 'number' ? usageData.count : 0;

          if (isSpecificFeature) {
            aiCallsByFeature[secondToLast] =
              (aiCallsByFeature[secondToLast] ?? 0) + count;
          }

          // ONLY count the "overall" records for total analytics to avoid double counting
          // (Specific feature records are for enforcement, overall records track everything)
          if (!isSpecificFeature) {
            totalAiCalls += count;
            callsPerUser[uid] = (callsPerUser[uid] ?? 0) + count;
            dailyCallCounts[datePart] =
              (dailyCallCounts[datePart] ?? 0) + count;
          }
        }

        console.log(
          `[getAdminAnalytics] Found ${totalAiUsageRecords} AI usage records`
        );

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
            if (
              typeof userData.email === 'string' &&
              userData.email.length > 0
            ) {
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

        console.log('[getAdminAnalytics] Analysis complete, returning results');
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
        console.error('[getAdminAnalytics] Error fetching analytics:', err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'An internal error occurred fetching analytics.';
        res.status(500).json({ error: 'internal', message: errorMessage });
      }
    });
  });
