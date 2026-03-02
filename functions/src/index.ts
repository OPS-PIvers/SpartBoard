import * as functionsV1 from 'firebase-functions/v1';
import * as functionsV2 from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import * as CryptoJS from 'crypto-js';
import { GoogleGenAI, Content } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

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
    | 'ocr';
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
      const DAILY_LIMIT = globalPerm?.config?.dailyLimit || 20;

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
      console.log('DEBUG: Full data object keys:', Object.keys(data || {}));
      console.log(
        `DEBUG: Received type: "${data?.type}" (Type: ${typeof data?.type})`
      );

      const genType = String(data?.type || '')
        .toLowerCase()
        .trim();
      console.log(`AI Gen starting for type: ${genType}`);

      const ai = new GoogleGenAI({ apiKey });

      let systemPrompt = '';
      let userPrompt = '';

      if (genType === 'mini-app') {
        systemPrompt = `
          You are an expert frontend developer. Create a single-file HTML/JS mini-app based on the user's request.
          Requirements:
          1. Single File (embedded CSS/JS).
          2. Use Tailwind CDN.
          3. Return JSON: { "title": "...", "html": "..." }
        `;
        userPrompt = `User Request: ${data.prompt}`;
      } else if (genType === 'poll') {
        systemPrompt = `
          You are an expert teacher. Create a 4-option multiple choice poll JSON:
          { "question": "...", "options": ["...", "...", "...", "..."] }
        `;
        userPrompt = `Topic: ${data.prompt}`;
      } else if (genType === 'dashboard-layout') {
        systemPrompt = `
          You are an expert instructional designer. Based on the user's lesson description, suggest a set of interactive widgets to place on their digital whiteboard.
          
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
          
          Requirements:
          1. Select 3-6 most relevant widgets for the activity.
          2. Return JSON: { "widgets": [{ "type": "...", "config": {} }] }
          3. 'config' should be an empty object {} unless you are setting a specific property known to that widget (like 'question' for 'poll').
        `;
        userPrompt = `Lesson/Activity Description: ${data.prompt}`;
      } else if (genType === 'instructional-routine') {
        systemPrompt = `
          You are an expert instructional designer. Create a classroom instructional routine based on the user's description.

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
        `;
        userPrompt = `Description: ${data.prompt}`;
      } else if (genType === 'ocr') {
        systemPrompt = `
          You are an expert at extracting text from images (OCR).
          Analyze the provided image and extract all readable text accurately.
          Maintain the structure as best as possible.
          If there are multiple paragraphs, separate them with double newlines.
          Return JSON: { "text": "extracted text here" }
        `;
        userPrompt = 'Extract text from this image.';
      } else {
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
        model: 'gemini-3-flash-preview',
        contents,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = result.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      console.log('AI Generation successful');
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
        parsedUrl.hostname !== 'api.openweathermap.org'
      ) {
        throw new Error('Invalid host or protocol');
      }
    } catch {
      throw new functionsV1.https.HttpsError(
        'invalid-argument',
        'Invalid proxy URL. Only https://api.openweathermap.org is allowed.'
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

    const accessToken = await auth.getAccessToken();

    if (!accessToken) {
      throw new functionsV2.https.HttpsError(
        'internal',
        'Failed to generate OAuth token.'
      );
    }

    const repoName = 'OPS-PIvers/SPART_Board';
    const { widgetName, description } = request.data;

    console.log(
      `Triggering Jules for widget: ${widgetName} in repo: ${repoName}`
    );

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
      console.log('Sending request to Jules API...');
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
      const sessionId = sessionIdFromName || session.id;

      if (!sessionId) {
        throw new functionsV2.https.HttpsError(
          'internal',
          'Jules API response is missing a session identifier (name or id).'
        );
      }

      console.log(`Jules session created: ${sessionId}`);

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
        errorMessage = data?.error?.message || error.message;
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
