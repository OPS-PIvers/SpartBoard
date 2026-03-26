import * as functionsV1 from 'firebase-functions/v1';
import * as functionsV2 from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import * as CryptoJS from 'crypto-js';
import { GoogleGenAI, Content } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { sanitizePrompt } from './sanitize';
// Local mirror of youtube-transcript's TranscriptResponse to avoid depending on
// an ESM-only package at the type level (dynamic import used at runtime instead).
interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
}

admin.initializeApp();

export const JULES_API_SESSIONS_ENDPOINT =
  'https://jules.googleapis.com/v1alpha/sessions';

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
    | 'quiz';
  prompt?: string;
  image?: string; // base64 data
}

interface GlobalPermConfig {
  dailyLimit?: number;
}

interface GlobalPermission {
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'all';
  betaUsers?: string[];
  config?: GlobalPermConfig;
}

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

    // 1. Check global feature permission for gemini-functions
    const globalPermDoc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const globalPerm = globalPermDoc.exists
      ? (globalPermDoc.data() as GlobalPermission)
      : null;

    // 2. Check if user is an admin
    const adminDoc = await db
      .collection('admins')
      .doc(email.toLowerCase())
      .get();
    const isAdmin = adminDoc.exists;

    // 3. Validate access
    if (globalPerm && !globalPerm.enabled) {
      throw new functionsV1.https.HttpsError(
        'permission-denied',
        'Gemini functions are currently disabled by an administrator.'
      );
    }

    if (!isAdmin) {
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

      // 4. Check and increment daily usage
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const usageRef = db.collection('ai_usage').doc(`${uid}_${today}`);
      const DAILY_LIMIT = globalPerm?.config?.dailyLimit ?? 20;

      try {
        await db.runTransaction(async (transaction) => {
          const usageDoc = await transaction.get(usageRef);
          const currentUsage = usageDoc.exists
            ? (usageDoc.data()?.count as number) || 0
            : 0;

          if (currentUsage >= DAILY_LIMIT) {
            throw new functionsV1.https.HttpsError(
              'resource-exhausted',
              `Daily AI usage limit reached (${DAILY_LIMIT} generations). Please try again tomorrow.`
            );
          }

          transaction.set(
            usageRef,
            {
              count: currentUsage + 1,
              email: email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
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

      const result = await ai.models.generateContent({
        model:
          genType === 'ocr'
            ? 'gemini-3-flash-preview'
            : 'gemini-3-flash-preview',
        contents,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = result.text;

      if (!text) {
        throw new Error('Empty response from AI');
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

interface JulesData {
  widgetName: string;
  description: string;
}

interface JulesSessionResponse {
  name?: string;
  id?: string;
}

interface JulesError {
  error?: {
    message?: string;
  };
}

export const triggerJulesWidgetGeneration = functionsV2.https.onCall<JulesData>(
  {
    timeoutSeconds: 300,
    memory: '256MiB',
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functionsV2.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    const email = request.auth.token.email;
    if (!email) {
      throw new functionsV2.https.HttpsError(
        'invalid-argument',
        'User must have an email associated with their account.'
      );
    }

    const db = admin.firestore();
    const adminDoc = await db
      .collection('admins')
      .doc(email.toLowerCase())
      .get();
    if (!adminDoc.exists) {
      throw new functionsV2.https.HttpsError(
        'permission-denied',
        'This function is restricted to administrators.'
      );
    }

    // Generate OAuth 2.0 Access Token

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const accessTokenResponse = (await auth.getAccessToken()) as unknown;

    const isTokenObject = (v: unknown): v is { token: string } => {
      if (!v || typeof v !== 'object') {
        return false;
      }
      if (!('token' in v)) {
        return false;
      }
      const value = (v as Record<string, unknown>).token;
      return typeof value === 'string' && value.length > 0;
    };

    const accessToken =
      typeof accessTokenResponse === 'string' && accessTokenResponse.length > 0
        ? accessTokenResponse
        : isTokenObject(accessTokenResponse)
          ? accessTokenResponse.token
          : null;

    if (!accessToken) {
      throw new functionsV2.https.HttpsError(
        'internal',
        'Failed to generate OAuth token.'
      );
    }

    const repoName = 'OPS-PIvers/SPART_Board';
    const { widgetName, description } = request.data;

    const prompt = `
      As a Jules Agent, your task is to implement a new widget for the SPART Board application.
      
      Widget Name: ${widgetName}
      Features Requested: ${description}
      
      Implementation Requirements:
      1. Create a new component in 'components/widgets/' named '${widgetName.replace(/\s+/g, '')}Widget.tsx'.
      2. Follow the existing patterns:
         - Accept 'widget: WidgetData' as a prop.
         - Use 'useDashboard()' for state updates.
         - Use Tailwind CSS for styling, adhering to the brand theme (brand-blue, brand-red, etc.).
         - Use Lucide icons.
      3. Register the new type in 'types.ts' (WidgetType).
      4. Add metadata to 'TOOLS' in 'config/tools.ts'.
      5. Map the component in 'WidgetRenderer.tsx'.
      6. Define default configuration in 'context/DashboardContext.tsx' (inside the 'addWidget' function).
      7. Add a unit test in 'components/widgets/' named '${widgetName.replace(/\s+/g, '')}Widget.test.tsx'.
      
      Please ensure all code is strictly typed and follows the project's 'Zero-tolerance' linting policy.
    `;

    try {
      // Use the named constant for the endpoint
      const { data: session } = await axios.post<JulesSessionResponse>(
        JULES_API_SESSIONS_ENDPOINT,
        {
          prompt: prompt,
          sourceContext: {
            source: `sources/github.com/${repoName}`,
            githubRepoContext: {
              startingBranch: 'main',
            },
          },
          automationMode: 'AUTO_CREATE_PR',
          title: `Generate Widget: ${widgetName}`,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const sessionIdFromName = session.name?.split('/').pop();
      const sessionId = sessionIdFromName ?? session.id;

      if (!sessionId) {
        throw new functionsV2.https.HttpsError(
          'internal',
          'Jules API response is missing a session identifier (name or id).'
        );
      }

      return {
        success: true,
        message: `Jules session started successfully. Session ID: ${sessionId}`,
        consoleUrl: `https://jules.google.com/session/${sessionId}`,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.warn(
          'Jules API 404: The source entity was not found. Please ensure the repository is connected to the Jules project.'
        );
      }
      let errorMessage = 'An unknown error occurred';
      if (axios.isAxiosError(error)) {
        console.error('Jules API Error Response Data:', error.response?.data);
        console.error('Jules API Error Status:', error.response?.status);

        const data = error.response?.data as JulesError | undefined;
        errorMessage = data?.error?.message ?? error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      console.error('Jules API Error:', errorMessage);
      throw new functionsV2.https.HttpsError(
        'internal',
        `Failed to trigger Jules: ${errorMessage}`
      );
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
 * Fetches YouTube captions and uses Gemini to generate timestamped
 * multiple-choice questions for the Video Activity widget.
 */
export const generateVideoActivity = functionsV1
  .runWith({
    secrets: ['GEMINI_API_KEY'],
    memory: '512MB',
    timeoutSeconds: 120,
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

      // Fetch transcript
      let transcriptItems: TranscriptResponse[] = [];
      try {
        const { fetchTranscript } = (await import('youtube-transcript')) as {
          fetchTranscript: (videoId: string) => Promise<TranscriptResponse[]>;
        };
        transcriptItems = await fetchTranscript(videoId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[generateVideoActivity] Transcript fetch failed for ${videoId}:`,
          msg
        );
        throw new functionsV1.https.HttpsError(
          'not-found',
          'No captions are available for this video. Try a different video, or ask your admin to enable Gemini audio transcription.'
        );
      }

      if (!transcriptItems || transcriptItems.length === 0) {
        throw new functionsV1.https.HttpsError(
          'not-found',
          'No captions are available for this video. Try a different video, or ask your admin to enable Gemini audio transcription.'
        );
      }

      // Build structured transcript text (timestamp + text per segment)
      const transcriptText = transcriptItems
        .map((item) => {
          const secs = Math.floor((item.offset ?? 0) / 1000);
          const mm = String(Math.floor(secs / 60)).padStart(2, '0');
          const ss = String(secs % 60).padStart(2, '0');
          return `[${mm}:${ss}] ${item.text.trim()}`;
        })
        .join('\n');

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new functionsV1.https.HttpsError(
          'internal',
          'Gemini API Key is missing on the server.'
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemPrompt = `You are an expert teacher creating a video comprehension activity.
You will be given a timed transcript of a YouTube video.
Generate exactly ${count} multiple-choice questions that check understanding of key concepts.

CRITICAL RULES:
1. Each question's "timestamp" field MUST be the exact second (as an integer) when the answer appears in the transcript.
   Convert "[MM:SS]" to total seconds: e.g. "[02:15]" → 135.
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

      const userPrompt = `Timed transcript:\n\n${transcriptText}`;

      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: systemPrompt + '\n\n' + userPrompt }],
        },
      ];

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents,
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

      // Separate, lower daily usage limit for audio (costly)
      const today = new Date().toISOString().split('T')[0];
      const usageRef = db.collection('ai_usage').doc(`${uid}_audio_${today}`);
      const AUDIO_DAILY_LIMIT = perm.config?.dailyLimit ?? 5;

      try {
        await db.runTransaction(async (transaction) => {
          const usageDoc = await transaction.get(usageRef);
          const currentUsage = usageDoc.exists
            ? (usageDoc.data()?.count as number) || 0
            : 0;

          if (currentUsage >= AUDIO_DAILY_LIMIT) {
            throw new functionsV1.https.HttpsError(
              'resource-exhausted',
              `Daily audio transcription limit reached (${AUDIO_DAILY_LIMIT} per day). Please try again tomorrow.`
            );
          }

          transaction.set(
            usageRef,
            {
              count: currentUsage + 1,
              email,
              lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          'message' in error
        ) {
          throw error;
        }
        throw new functionsV1.https.HttpsError(
          'internal',
          'Failed to verify audio transcription usage limits.'
        );
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
      const model = perm.config?.model ?? 'gemini-3-flash-preview';
      const ai = new GoogleGenAI({ apiKey });

      const systemPrompt = `You are an expert teacher creating a video comprehension activity.
Watch the provided YouTube video and generate exactly ${count} multiple-choice questions.

CRITICAL RULES:
1. Each question's "timestamp" field MUST be an integer (seconds from start) when the answer is discussed.
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
                  text: `Video URL: https://www.youtube.com/watch?v=${videoId}`,
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
  label?: string;
  interactionType: string;
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

export const generateGuidedLearning = functionsV1.https.onCall(
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
      "interactionType": "text-popover" | "tooltip" | "pan-zoom" | "spotlight" | "question",
      "text": "string (for text-popover/tooltip)",
      "panZoomScale": number (1.5-4, for pan-zoom only),
      "spotlightRadius": number (10-40, for spotlight only),
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
- Use text-popover for key concepts, spotlight to highlight areas, pan-zoom to zoom in on details, questions to check understanding
- Place hotspots at meaningful locations on the image (xPct/yPct as percentages 0-100)
- Include at least 1 question step for comprehension checking
- Make content educational and age-appropriate
- Set autoAdvanceDuration to 5-15 seconds for non-question steps in guided mode`;

      const userPrompt = prompt
        ? `Additional instructions: ${sanitizePrompt(prompt)}`
        : 'Analyze this educational image and create an engaging guided learning experience.';

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
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
export * from './adminAnalytics';
