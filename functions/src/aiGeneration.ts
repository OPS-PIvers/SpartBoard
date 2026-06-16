import './functionsInit';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { GoogleGenAI, Content, Type, Schema } from '@google/genai';
import { sanitizePrompt } from './sanitize';
import { parseGeminiJson } from './parseGeminiJson';
import { BoundedLruMap } from './utils/boundedLruMap';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { GEMINI_API_KEY } from './secrets';
import { GlobalPermission, normalizeModelName } from './shared';

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
    | 'blooms-ai'
    | 'video-activity-recommend';
  prompt?: string;
  image?: string; // base64 data
  /**
   * Per-type quiz question counts. Only honored for `type === 'quiz'`.
   * Each entry is the number of questions of that type the teacher
   * requested. Unspecified types are treated as zero.
   */
  typeCounts?: Partial<Record<QuizGenType, number>>;
}

type QuizGenType = 'MC' | 'FIB' | 'Matching' | 'Ordering';

const DEFAULT_ADVANCED_MODEL = 'gemini-3-flash-preview';
const DEFAULT_STANDARD_MODEL = 'gemini-3.1-flash-lite-preview';

interface GeminiModelConfig {
  advancedModel?: string;
  standardModel?: string;
}

// Module-scope read caches for `generateWithAI`. Cloud Functions 2nd-gen
// reuses warm instances, so caching across invocations within a warm
// instance materially cuts Firestore reads for high-traffic AI features
// (audit doc, item #3 — was 4–6 reads per call, now 2 transactional reads
// on warm hits). 5-minute TTL keeps admin demotions and model-config
// overrides propagating within an acceptable window.
//
// NOT cached: `ai_usage/*` counter reads and the in-transaction
// `global_permissions/*` reads. Those gate rate-limit enforcement and
// must be transactional to prevent races.
const READ_CACHE_TTL_MS = 5 * 60 * 1000;

interface ModelConfigCacheEntry {
  value: {
    advancedModel: string;
    standardModel: string;
    usedFallback: boolean;
  };
  cachedAt: number;
}
let cachedModelConfig: ModelConfigCacheEntry | null = null;

interface AdminStatusCacheEntry {
  isAdmin: boolean;
  cachedAt: number;
}

// Bound on `cachedAdminStatus` size. A warm Cloud Functions instance that
// sees many distinct callers across its lifetime would otherwise grow this
// Map unboundedly. At school-district scale this is firmly in "won't
// matter" territory (low thousands of admins org-wide), but a hard cap
// closes the long-tail memory growth path that two independent reviewers
// flagged on PR #1590. `BoundedLruMap` promotes on read so frequently-hit
// keys survive eviction pressure from one-off callers — this becomes
// load-bearing once the same pattern is reused on a higher-cardinality key
// space (e.g. the student-pseudonym path).
const ADMIN_STATUS_CACHE_MAX = 500;
const cachedAdminStatus = new BoundedLruMap<string, AdminStatusCacheEntry>(
  ADMIN_STATUS_CACHE_MAX
);

/**
 * Test-only: reset the module-scope read caches so tests can observe a
 * cold-start read sequence. Underscored prefix makes it obvious this is
 * not a production API.
 */
export function __resetGenerateWithAICaches(): void {
  cachedModelConfig = null;
  cachedAdminStatus.clear();
}

/**
 * Reads the admin-configured model overrides from the `gemini-functions`
 * global permissions document. Returns validated model names (or defaults).
 * Memoized with a 5-minute TTL — see `READ_CACHE_TTL_MS` above.
 *
 * `usedFallback` is `true` when the Firestore read threw — meaning the
 * caller is running with hardcoded defaults rather than whatever overrides
 * an admin may have configured. Plumb this back to the client so admins
 * get a one-time UI signal during Firestore brownouts. Cache hits always
 * return `usedFallback: false` because the catch path deliberately does
 * NOT populate the cache.
 */
async function getGeminiModelConfig(db: admin.firestore.Firestore): Promise<{
  advancedModel: string;
  standardModel: string;
  usedFallback: boolean;
}> {
  const now = Date.now();
  if (
    cachedModelConfig &&
    now - cachedModelConfig.cachedAt < READ_CACHE_TTL_MS
  ) {
    return cachedModelConfig.value;
  }
  try {
    const doc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const cfg = doc.data()?.config as GeminiModelConfig | undefined;
    const value = {
      advancedModel:
        normalizeModelName(cfg?.advancedModel) ?? DEFAULT_ADVANCED_MODEL,
      standardModel:
        normalizeModelName(cfg?.standardModel) ?? DEFAULT_STANDARD_MODEL,
      usedFallback: false,
    };
    cachedModelConfig = { value, cachedAt: now };
    return value;
  } catch (error) {
    console.warn(
      'Failed to read Gemini model config from Firestore; using defaults.',
      error
    );
    // Do not cache the fallback — a transient Firestore error shouldn't
    // pin the function to defaults for 5 minutes.
    return {
      advancedModel: DEFAULT_ADVANCED_MODEL,
      standardModel: DEFAULT_STANDARD_MODEL,
      usedFallback: true,
    };
  }
}

/**
 * Memoized admin lookup. The `admins/{email}` doc rarely changes during a
 * single warm-instance lifetime, so caching for 5 minutes saves one
 * Firestore read per warm `generateWithAI` call. Key is the lowercased
 * email (matches the production read).
 *
 * Trade-offs: TTL bounds both admin demotion lag (cached `true` survives
 * a demotion for up to 5 min — they keep elevated quota briefly) and
 * promotion lag (cached `false` survives a promotion for up to 5 min —
 * they see old limits briefly). Both are acceptable.
 *
 * No try/catch here on purpose. A Firestore failure must throw up to the
 * caller — caching a wrong answer would either grant non-admins admin
 * quotas (false positive) or strip admins of their quotas (false
 * negative), both worse than a temporary 5xx that the client retries.
 */
async function getCachedAdminStatus(
  db: admin.firestore.Firestore,
  emailLower: string
): Promise<boolean> {
  const now = Date.now();
  const cached = cachedAdminStatus.get(emailLower);
  if (cached) {
    if (now - cached.cachedAt < READ_CACHE_TTL_MS) {
      return cached.isAdmin;
    }
    // Prune stale entries so a long-lived warm instance that sees many
    // unique callers doesn't accumulate dead Map entries.
    cachedAdminStatus.delete(emailLower);
  }
  const doc = await db.collection('admins').doc(emailLower).get();
  const isAdmin = doc.exists;
  cachedAdminStatus.set(emailLower, { isAdmin, cachedAt: now });
  return isAdmin;
}

// Test-only re-exports so the cache contract can be verified without
// driving through the full `generateWithAI` pipeline (which would require
// mocking `@google/genai`). The `__` prefix makes the test-only status
// grep-able.
export {
  getCachedAdminStatus as __getCachedAdminStatus,
  getGeminiModelConfig as __getGeminiModelConfig,
};

export const generateWithAI = onCall(
  {
    memory: '512MiB',
    secrets: [GEMINI_API_KEY],
    cors: ALLOWED_ORIGINS,
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

    // Check if user is an admin (cached for 5 minutes per warm instance).
    const isAdmin = await getCachedAdminStatus(db, email.toLowerCase());

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
    if (genType === 'video-activity-recommend')
      specificFeatureId = 'video-activity-recommend';
    if (genType === 'dashboard-layout') specificFeatureId = 'dashboard-layout';
    if (genType === 'instructional-routine')
      specificFeatureId = 'instructional-routine';
    if (genType === 'widget-builder') specificFeatureId = 'widget-builder';
    if (genType === 'widget-explainer') specificFeatureId = 'widget-explainer';

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
      // `genType` is already computed above (feature-permission gate); reuse it.
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
        quiz: () => {
          const { counts: quizCounts, total: quizTotal } =
            normalizeTypeCounts<QuizGenType>(
              QUIZ_QUESTION_TYPES,
              data?.typeCounts
            );
          // Back-compat: if the client didn't send `typeCounts`, fall back
          // to a sensible default (5 MC) so older clients keep working
          // until they redeploy with the new payload.
          if (quizTotal <= 0) {
            quizCounts.MC = 5;
          }
          const effectiveTotal =
            quizTotal > 0
              ? quizTotal
              : QUIZ_QUESTION_TYPES.reduce((sum, t) => sum + quizCounts[t], 0);
          return {
            systemPrompt: buildQuizPrompt(
              quizCounts,
              effectiveTotal,
              bufferedRequestCount(effectiveTotal),
              sanitizedUserInput
            ),
            userPrompt: '',
          };
        },
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
        'video-activity-recommend': () => ({
          systemPrompt: `
You are an expert classroom instructional designer recommending YouTube videos for K-12 teachers building Video Activity assignments. The teacher will provide a topic, learning objective, or grade-level description in the <topic> tags. Recommend a SINGLE high-quality, classroom-appropriate YouTube video that fits the topic.

Hard constraints:
1. The video MUST be on YouTube (not Vimeo, TED.com, etc.) and have a stable 11-character video id.
2. Prefer videos under 15 minutes — shorter is better for in-class video activities.
3. Prefer educator-aligned channels (Crash Course, SciShow Kids, Khan Academy, TED-Ed, National Geographic, etc.) over random uploads.
4. Reject anything with mature content, ads-heavy intros, or low production quality.
5. If you cannot confidently recommend a real, currently-live YouTube video that fits the topic, return { "videoId": "", "title": "", "rationale": "..." } with an empty videoId — do NOT hallucinate ids.

Output JSON ONLY in this exact shape:
{
  "videoId": "11_char_id",
  "title": "Video title as you remember it",
  "rationale": "One sentence explaining why this fits the topic and grade level."
}
          `,
          userPrompt: `Topic: <topic>${sanitizedUserInput}</topic>`,
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

      // Quiz alone uses structured-output (responseSchema) — it has a fixed
      // shape we want to enforce. Other generators stay on plain JSON mode
      // because they have looser, type-specific shapes.
      const responseSchema =
        genType === 'quiz' ? buildQuizResponseSchema() : undefined;

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
          ...(responseSchema ? { responseSchema } : {}),
        },
      });

      const text = result.text;

      if (!text) {
        throw new Error('Empty response from AI');
      }

      // blooms-ai returns plain text — wrap in { text } for the generic callAI client
      if (genType === 'blooms-ai') {
        return { text, _modelConfigUsedFallback: geminiConfig.usedFallback };
      }

      // widget-builder and widget-explainer return plain text — wrap in { result } for the client
      if (genType === 'widget-builder' || genType === 'widget-explainer') {
        return {
          result: text,
          _modelConfigUsedFallback: geminiConfig.usedFallback,
        };
      }

      const parsed = parseGeminiJson<Record<string, unknown>>(text);

      // Quiz: post-validate and trim per-type quotas. Without this, Gemini
      // can return a shape that doesn't match the per-type field rules
      // documented in types.ts (e.g., a "Matching" question with the wrong
      // pipe encoding) and the editor would silently render garbage.
      if (genType === 'quiz') {
        const { counts: quizCounts, total: quizTotal } =
          normalizeTypeCounts<QuizGenType>(
            QUIZ_QUESTION_TYPES,
            data?.typeCounts
          );
        if (quizTotal <= 0) quizCounts.MC = 5;
        const validatedQuestions = validateAndBucketQuizQuestions(
          parsed.questions,
          quizCounts
        );
        if (validatedQuestions.length === 0) {
          throw new HttpsError(
            'internal',
            'The AI did not produce any usable questions. Try adjusting the topic or the question mix.'
          );
        }
        return {
          title:
            typeof parsed.title === 'string' && parsed.title.trim().length > 0
              ? parsed.title
              : 'AI-generated quiz',
          questions: validatedQuestions,
          _modelConfigUsedFallback: geminiConfig.usedFallback,
        };
      }

      // Annotate JSON responses with the fallback flag so the client can
      // surface a one-time admin notice. Underscore-prefixed to make the
      // marker obvious and avoid colliding with any field Gemini returns.
      return { ...parsed, _modelConfigUsedFallback: geminiConfig.usedFallback };
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

// ---------------------------------------------------------------------------
// Video Activity: Caption-based AI question generation
// ---------------------------------------------------------------------------

type VideoQuestionType = 'MC' | 'FIB' | 'MA';

interface VideoActivityRequestData {
  url: string;
  /**
   * Per-type question counts the teacher requested in the AI overlay. The
   * server requests a slight surplus from Gemini, then post-validates and
   * trims back to these quotas so hallucinations get dropped instead of
   * surfacing to the user.
   */
  typeCounts?: Partial<Record<VideoQuestionType, number>>;
  /**
   * Legacy single-count field. Older deployed clients send this instead of
   * `typeCounts`. Server treats it as `{ MC: questionCount }` during a
   * staggered functions/frontend deploy so in-flight calls don't break.
   */
  questionCount?: number;
  /**
   * Total video duration in seconds, captured client-side from the YouTube
   * IFrame player. Used as a hard upper bound on emitted timestamps — any
   * question Gemini returns with a timestamp beyond this is dropped.
   * Optional because Gemini will still produce reasonable timestamps without
   * it, but accuracy is much higher when provided.
   */
  durationSeconds?: number;
}

interface GeneratedVideoQuestion {
  text: string;
  timestamp: number;
  type: VideoQuestionType;
  correctAnswer: string;
  incorrectAnswers: string[];
  /** FIB-only: optional alternate accepted answer forms (e.g. ["color", "colour"]). */
  acceptableVariants?: string[];
  timeLimit: number;
}

interface GeneratedVideoActivity {
  title: string;
  questions: GeneratedVideoQuestion[];
  /**
   * Optional: `true` when the Cloud Function couldn't read the admin model
   * config from Firestore and fell back to hardcoded defaults. Lets the
   * client surface a one-time admin notice without polluting every call.
   */
  _modelConfigUsedFallback?: boolean;
}

// ---------------------------------------------------------------------------
// Video Activity / Quiz AI helpers
//
// These helpers are exported (named) but not re-exported through the Firebase
// callables list — they're internal to this file's two AI generators. Keeping
// them as pure functions makes the prompt + post-validation logic testable in
// isolation (no Firestore, no Gemini calls).
// ---------------------------------------------------------------------------

/** Order matters: this is the per-type emit order in prompts. */
const VIDEO_QUESTION_TYPES: VideoQuestionType[] = ['MC', 'FIB', 'MA'];
const QUIZ_QUESTION_TYPES: QuizGenType[] = [
  'MC',
  'FIB',
  'Matching',
  'Ordering',
];

const VIDEO_TYPE_LABEL: Record<VideoQuestionType, string> = {
  MC: 'Multiple Choice',
  FIB: 'Fill in the Blank',
  MA: 'Multi-Answer (select multiple)',
};

const QUIZ_TYPE_LABEL: Record<QuizGenType, string> = {
  MC: 'Multiple Choice',
  FIB: 'Fill in the Blank',
  Matching: 'Matching pairs',
  Ordering: 'Sequence ordering',
};

interface NormalizedCounts<T extends string> {
  counts: Record<T, number>;
  total: number;
}

/** Clamp negative/non-finite counts to zero and compute a total. */
function normalizeTypeCounts<T extends string>(
  allowed: readonly T[],
  raw: Partial<Record<T, number>> | undefined
): NormalizedCounts<T> {
  const counts = {} as Record<T, number>;
  let total = 0;
  for (const t of allowed) {
    const n = Number(raw?.[t]);
    const clean = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    counts[t] = clean;
    total += clean;
  }
  return { counts, total };
}

/**
 * Ask Gemini for a surplus so hallucinations can be filtered without
 * leaving the teacher short on questions. ~30% extra plus a minimum of +2,
 * capped at 60 so a pathological per-type request (15 of each of 4 quiz
 * types → 60 requested → 80 with surplus) doesn't balloon the prompt past
 * what Gemini can usefully reason about. The per-type stepper UI caps each
 * type at 15, so 60 raw is the worst case we should encounter in practice.
 */
function bufferedRequestCount(requested: number): number {
  if (requested <= 0) return 0;
  return Math.min(60, Math.ceil(requested * 1.3) + 2);
}

/**
 * Back-compat shim for in-flight video-activity callers that haven't
 * received the new bundle yet. If the request only contains the legacy
 * `questionCount` field (or both fields are empty), treat it as
 * `{ MC: questionCount }` so we don't reject a payload from an older
 * frontend during a staggered Functions/frontend deploy.
 */
function legacyVideoTypeCountsFallback(
  typeCounts: Partial<Record<VideoQuestionType, number>> | undefined,
  questionCount: number | undefined
): Partial<Record<VideoQuestionType, number>> | undefined {
  const supplied = typeCounts ?? {};
  const hasAny = VIDEO_QUESTION_TYPES.some((t) => Number(supplied[t]) > 0);
  if (hasAny) return supplied;
  const legacy = Number(questionCount);
  if (Number.isFinite(legacy) && legacy > 0) {
    return { MC: Math.floor(legacy) };
  }
  return supplied;
}

function buildVideoActivityPrompt(
  counts: Record<VideoQuestionType, number>,
  total: number,
  bufferedTotal: number,
  durationSeconds: number | undefined
): string {
  const mixLines = VIDEO_QUESTION_TYPES.filter((t) => counts[t] > 0)
    .map((t) => `   - ${counts[t]} ${VIDEO_TYPE_LABEL[t]} ("${t}")`)
    .join('\n');

  const durationLine =
    durationSeconds && durationSeconds > 0
      ? `The video is exactly ${Math.floor(durationSeconds)} seconds long. Every "timestamp" you emit MUST be an integer between 0 and ${Math.floor(durationSeconds)} inclusive. NEVER invent timestamps beyond ${Math.floor(durationSeconds)}.`
      : 'Every "timestamp" you emit MUST be an integer second that falls within the actual video. Do not invent timestamps past the end of the video.';

  return `You are an expert teacher creating a video comprehension activity.
Watch the provided YouTube video and generate up to ${bufferedTotal} questions that check understanding of key concepts.

TARGET QUESTION MIX (the teacher requested ${total} questions total):
${mixLines}

CRITICAL RULES:
1. ${durationLine}
2. Each question's "timestamp" should sit AT or JUST AFTER the moment the answer is discussed, so students hear the explanation before being prompted.
3. Questions must be in ascending "timestamp" order.
4. Every question must be grounded in something actually said or shown in the video. Do not paraphrase generic facts that aren't covered.
5. Per-type shape (the "type" field decides which fields are required):
   - "MC": "correctAnswer" is the one correct option (string). "incorrectAnswers" MUST contain exactly 3 plausible-but-wrong distractor strings. Leave "acceptableVariants" empty.
   - "FIB": "correctAnswer" is the single canonical accepted answer (a short word or phrase students would type). "incorrectAnswers" MUST be an empty array. Optionally fill "acceptableVariants" with 0–3 additional accepted spellings/synonyms (e.g. ["color", "colour"]).
   - "MA": "correctAnswer" is a pipe-separated list of the correct selections, e.g. "option1|option2". "incorrectAnswers" contains 2–4 distractor options shown alongside. Leave "acceptableVariants" empty.
6. "timeLimit" should be 20–45 seconds (integer).
7. Aim for the requested type counts above. If you cannot find enough good content for a type, emit fewer of that type rather than padding with another type or fabricating content.
8. Return ONLY valid JSON matching the provided schema. No markdown fences, no commentary.`;
}

function buildQuizPrompt(
  counts: Record<QuizGenType, number>,
  total: number,
  bufferedTotal: number,
  userInput: string
): string {
  const mixLines = QUIZ_QUESTION_TYPES.filter((t) => counts[t] > 0)
    .map((t) => `   - ${counts[t]} ${QUIZ_TYPE_LABEL[t]} ("${t}")`)
    .join('\n');

  return `You are an expert teacher creating a classroom quiz.
Generate a quiz based on the topic or content provided within <topic> tags below. Produce up to ${bufferedTotal} questions to satisfy the requested mix (target ${total} total).

TARGET QUESTION MIX:
${mixLines}

Per-type shape (the "type" field decides which fields are required):
- "MC": "correctAnswer" is the one correct option. "incorrectAnswers" MUST contain exactly 3 plausible-but-wrong distractor strings.
- "FIB": "correctAnswer" is the single canonical accepted answer (short word or phrase). "incorrectAnswers" MUST be an empty array.
- "Matching": "correctAnswer" is a pipe-separated list of "term:definition" pairs, e.g. "Mars:fourth planet|Venus:second planet|Earth:third planet". Provide 3–6 pairs. "incorrectAnswers" MUST be an empty array.
- "Ordering": "correctAnswer" is a pipe-separated list of items in their correct sequence, e.g. "First|Second|Third|Fourth". Provide 3–6 items. "incorrectAnswers" MUST be an empty array.

Other rules:
1. "timeLimit" should be 20–60 seconds depending on complexity (integer).
2. Questions should progress from easier to harder.
3. Aim for the requested type counts above. If you cannot find enough good content for a type, emit fewer of that type rather than padding with another type or fabricating content.
4. Return ONLY valid JSON matching the provided schema. No markdown fences, no commentary.

Topic/Content: <topic>${userInput}</topic>`;
}

function buildVideoActivityResponseSchema(): Schema {
  return {
    type: Type.OBJECT,
    required: ['title', 'questions'],
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            'text',
            'timestamp',
            'type',
            'correctAnswer',
            'incorrectAnswers',
            'timeLimit',
          ],
          properties: {
            text: { type: Type.STRING },
            timestamp: { type: Type.INTEGER },
            type: {
              type: Type.STRING,
              enum: ['MC', 'FIB', 'MA'],
            },
            correctAnswer: { type: Type.STRING },
            incorrectAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            acceptableVariants: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            timeLimit: { type: Type.INTEGER },
          },
        },
      },
    },
  };
}

function buildQuizResponseSchema(): Schema {
  return {
    type: Type.OBJECT,
    required: ['title', 'questions'],
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            'text',
            'type',
            'correctAnswer',
            'incorrectAnswers',
            'timeLimit',
          ],
          properties: {
            text: { type: Type.STRING },
            type: {
              type: Type.STRING,
              enum: ['MC', 'FIB', 'Matching', 'Ordering'],
            },
            correctAnswer: { type: Type.STRING },
            incorrectAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            timeLimit: { type: Type.INTEGER },
          },
        },
      },
    },
  };
}

/**
 * Drop malformed entries, drop entries with timestamps outside the video,
 * bucket by type, and trim each bucket to its requested quota. Returns the
 * accepted questions sorted by timestamp.
 *
 * Exported (via export keyword) primarily so a future test file can exercise
 * the validator without needing a Firebase/Gemini harness.
 */
export function validateAndBucketVideoQuestions(
  raw: unknown,
  counts: Record<VideoQuestionType, number>,
  durationSeconds: number | undefined
): GeneratedVideoQuestion[] {
  if (!Array.isArray(raw)) return [];
  const maxTs =
    durationSeconds && durationSeconds > 0
      ? Math.floor(durationSeconds)
      : Infinity;

  const buckets: Record<VideoQuestionType, GeneratedVideoQuestion[]> = {
    MC: [],
    FIB: [],
    MA: [],
  };

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const type = q.type;
    if (type !== 'MC' && type !== 'FIB' && type !== 'MA') {
      continue;
    }
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) continue;
    const timestamp =
      typeof q.timestamp === 'number' ? Math.floor(q.timestamp) : NaN;
    if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > maxTs) {
      continue;
    }
    const correctAnswer =
      typeof q.correctAnswer === 'string' ? q.correctAnswer.trim() : '';
    if (!correctAnswer) continue;
    const incorrectAnswers = Array.isArray(q.incorrectAnswers)
      ? q.incorrectAnswers.filter(
          (a): a is string => typeof a === 'string' && a.trim().length > 0
        )
      : [];
    // The prompt asks for exactly 3 distractors for MC. Validator floor is
    // 3 to match — with the `bufferedRequestCount` surplus we'd rather drop
    // a thin question than render a watered-down 3-option MC.
    if (type === 'MC' && incorrectAnswers.length < 3) continue;
    // MA stores correct selections pipe-joined in `correctAnswer` and
    // shows `incorrectAnswers` as the distractor options. A "MA" with no
    // distractors degenerates into "pick the only choice"; the prompt
    // asks for 2–4 distractors, so we require at least 2 of each side.
    if (type === 'MA' && !isValidOrderingList(correctAnswer, 2)) continue;
    if (type === 'MA' && incorrectAnswers.length < 2) continue;
    const timeLimitRaw =
      typeof q.timeLimit === 'number' ? Math.floor(q.timeLimit) : 30;
    const timeLimit =
      Number.isFinite(timeLimitRaw) && timeLimitRaw > 0 ? timeLimitRaw : 30;
    const acceptableVariants =
      type === 'FIB' && Array.isArray(q.acceptableVariants)
        ? q.acceptableVariants.filter(
            (a): a is string => typeof a === 'string' && a.trim().length > 0
          )
        : undefined;

    const validated: GeneratedVideoQuestion = {
      text,
      timestamp,
      type,
      correctAnswer,
      incorrectAnswers: type === 'FIB' ? [] : incorrectAnswers,
      timeLimit,
      ...(acceptableVariants && acceptableVariants.length > 0
        ? { acceptableVariants }
        : {}),
    };

    if (buckets[type].length < counts[type]) {
      buckets[type].push(validated);
    }
  }

  return [...buckets.MC, ...buckets.FIB, ...buckets.MA].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

/** Pipe-delimited Ordering payloads must have at least 2 non-empty entries. */
function isValidOrderingList(value: string, minEntries: number): boolean {
  const parts = value.split('|').filter((p) => p.trim().length > 0);
  return parts.length >= minEntries;
}

/**
 * Matching payloads use `"term1:def1|term2:def2"` per the storage rules in
 * types.ts. The validator must reject pipe-only output (an Ordering-shaped
 * payload that Gemini mislabeled as Matching), so each pair MUST contain a
 * non-empty term and a non-empty definition separated by `:`.
 */
function isValidMatchingList(value: string, minPairs: number): boolean {
  const parts = value.split('|').filter((p) => p.trim().length > 0);
  if (parts.length < minPairs) return false;
  return parts.every((pair) => {
    const colonIdx = pair.indexOf(':');
    if (colonIdx <= 0) return false;
    const term = pair.slice(0, colonIdx).trim();
    const def = pair.slice(colonIdx + 1).trim();
    return term.length > 0 && def.length > 0;
  });
}

interface ValidatedQuizQuestion {
  text: string;
  type: QuizGenType;
  correctAnswer: string;
  incorrectAnswers: string[];
  timeLimit: number;
}

/**
 * Quiz counterpart to `validateAndBucketVideoQuestions`. Unlike the video
 * flow (which sorts by `timestamp`), the quiz prompt asks for "easier to
 * harder" progression, so we preserve Gemini's original emit order while
 * still enforcing per-type quotas: iterate raw in order, accept each valid
 * question until that type's bucket fills, drop the rest.
 */
export function validateAndBucketQuizQuestions(
  raw: unknown,
  counts: Record<QuizGenType, number>
): ValidatedQuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const accepted: ValidatedQuizQuestion[] = [];
  const filled: Record<QuizGenType, number> = {
    MC: 0,
    FIB: 0,
    Matching: 0,
    Ordering: 0,
  };

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const type = q.type;
    if (
      type !== 'MC' &&
      type !== 'FIB' &&
      type !== 'Matching' &&
      type !== 'Ordering'
    ) {
      continue;
    }
    if (filled[type] >= counts[type]) continue;
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) continue;
    const correctAnswer =
      typeof q.correctAnswer === 'string' ? q.correctAnswer.trim() : '';
    if (!correctAnswer) continue;
    const incorrectAnswers = Array.isArray(q.incorrectAnswers)
      ? q.incorrectAnswers.filter(
          (a): a is string => typeof a === 'string' && a.trim().length > 0
        )
      : [];
    // The prompts ask for exactly 3 distractors (MC) and 3+ pairs/items
    // (Matching, Ordering). Validator floors match — with the
    // `bufferedRequestCount` surplus we'd rather drop a thin question than
    // render a 3-option MC or a 2-pair Matching that the teacher didn't
    // ask for.
    if (type === 'MC' && incorrectAnswers.length < 3) continue;
    if (type === 'Matching' && !isValidMatchingList(correctAnswer, 3)) {
      continue;
    }
    if (type === 'Ordering' && !isValidOrderingList(correctAnswer, 3)) {
      continue;
    }
    const timeLimitRaw =
      typeof q.timeLimit === 'number' ? Math.floor(q.timeLimit) : 30;
    const timeLimit =
      Number.isFinite(timeLimitRaw) && timeLimitRaw > 0 ? timeLimitRaw : 30;

    accepted.push({
      text,
      type,
      correctAnswer,
      incorrectAnswers: type === 'MC' ? incorrectAnswers : [],
      timeLimit,
    });
    filled[type] += 1;
  }

  return accepted;
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
    cors: ALLOWED_ORIGINS,
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

    const { url, typeCounts, questionCount, durationSeconds } = data;

    if (!url || typeof url !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'A valid YouTube URL is required.'
      );
    }

    const effectiveTypeCounts = legacyVideoTypeCountsFallback(
      typeCounts,
      questionCount
    );
    const { counts, total } = normalizeTypeCounts<VideoQuestionType>(
      VIDEO_QUESTION_TYPES,
      effectiveTypeCounts
    );
    if (total <= 0) {
      throw new HttpsError(
        'invalid-argument',
        'Select at least one question to generate.'
      );
    }
    const bufferedTotal = bufferedRequestCount(total);

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

    const cleanDuration =
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0
        ? Math.floor(durationSeconds)
        : undefined;

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

    const systemPrompt = buildVideoActivityPrompt(
      counts,
      total,
      bufferedTotal,
      cleanDuration
    );

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
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildVideoActivityResponseSchema(),
        },
      });

      const text = result.text;
      if (!text) throw new Error('Empty response from AI');

      const parsed = parseGeminiJson<{
        title?: unknown;
        questions?: unknown;
      }>(text);

      if (!parsed.title || typeof parsed.title !== 'string') {
        throw new Error('Invalid response structure from AI (missing title).');
      }

      const validatedQuestions = validateAndBucketVideoQuestions(
        parsed.questions,
        counts,
        cleanDuration
      );

      if (validatedQuestions.length === 0) {
        throw new Error(
          'The AI did not produce any usable questions for this video. Try a different video or adjust the question mix.'
        );
      }

      return {
        title: parsed.title,
        questions: validatedQuestions,
        _modelConfigUsedFallback: geminiConfig.usedFallback,
      };
    } catch (error: unknown) {
      console.error('[generateVideoActivity] Gemini error:', error);
      if (error instanceof HttpsError) throw error;
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
  /** See `VideoActivityRequestData.typeCounts`. */
  typeCounts?: Partial<Record<VideoQuestionType, number>>;
  /** See `VideoActivityRequestData.questionCount`. */
  questionCount?: number;
  /** See `VideoActivityRequestData.durationSeconds`. */
  durationSeconds?: number;
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
    cors: ALLOWED_ORIGINS,
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

    const { url, typeCounts, durationSeconds } = data;

    const { counts, total } = normalizeTypeCounts<VideoQuestionType>(
      VIDEO_QUESTION_TYPES,
      typeCounts
    );
    if (total <= 0) {
      throw new HttpsError(
        'invalid-argument',
        'Select at least one question to generate.'
      );
    }
    const bufferedTotal = bufferedRequestCount(total);

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

    const cleanDuration =
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0
        ? Math.floor(durationSeconds)
        : undefined;

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

    const systemPrompt = buildVideoActivityPrompt(
      counts,
      total,
      bufferedTotal,
      cleanDuration
    );

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
        config: {
          responseMimeType: 'application/json',
          responseSchema: buildVideoActivityResponseSchema(),
        },
      });

      const text = result.text;
      if (!text) throw new Error('Empty response from AI');

      const parsed = parseGeminiJson<{
        title?: unknown;
        questions?: unknown;
      }>(text);

      if (!parsed.title || typeof parsed.title !== 'string') {
        throw new Error('Invalid response structure from AI (missing title).');
      }

      const validatedQuestions = validateAndBucketVideoQuestions(
        parsed.questions,
        counts,
        cleanDuration
      );

      if (validatedQuestions.length === 0) {
        throw new Error(
          'The AI did not produce any usable questions for this video. Try a different video or adjust the question mix.'
        );
      }

      return {
        title: parsed.title,
        questions: validatedQuestions,
      };
    } catch (error: unknown) {
      console.error('[transcribeVideoWithGemini] Gemini error:', error);
      if (error instanceof HttpsError) throw error;
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
  /** See `GeneratedVideoActivity._modelConfigUsedFallback`. */
  _modelConfigUsedFallback?: boolean;
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
    cors: ALLOWED_ORIGINS,
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

      return {
        ...parsed,
        _modelConfigUsedFallback: geminiConfig.usedFallback,
      };
    } catch (error: unknown) {
      console.error('[generateGuidedLearning] Gemini error:', error);
      const detail = error instanceof Error ? error.message : 'unknown error';
      const msg = `AI generation failed (model: ${guidedLearningModel}): ${detail}`;
      throw new HttpsError('internal', msg);
    }
  }
);
