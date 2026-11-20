// Import's AI Conversions callable: Flashcards, Activity Wall prompt and Board from a Source (docs/plans/IMPORT.md D8, D10, D11, D28).
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  enforceAiFeatureAccess,
  recordAiUsage,
  refundAiUsage,
  resolveCallerIsAdminFor,
  type AiExtraCap,
  type AiUsageCharge,
} from './aiGeneration';
import { importAiAccess, type ImportAiAccess } from './importSettings';
import { isExcludedFrom } from './permissionExclusion';
import { assertViewAsAllowed } from './viewAsGuard';
import { generateAi } from './aiRouter';
import { getAiModelConfig } from './aiModelConfig';
import { maxInputCharsFor } from './aiLimits';
import { readAllowedWidgets } from './boardTemplateLayout';
import { isDistrictStaffToken } from './districtStaff';
import {
  buildConversionPrompt,
  CONVERSION_INTEGRATION,
  fitSourceText,
  parseActivityWallResponse,
  parseBoardResponse,
  parseConversionRequest,
  parseFlashcardsResponse,
  type ConversionRequest,
  type ConversionResult,
} from './importConversionAi';
import type { AiIntegrationId } from './aiIntegrations';
import { safeErr } from './safeLog';

type Firestore = admin.firestore.Firestore;
type Token = {
  email?: string;
  email_verified?: boolean;
  studentRole?: unknown;
  pinLogin?: unknown;
};

/** The preview flag that gates Import; AI Conversions are metered under it too. */
export const UNIVERSAL_IMPORT_FEATURE_ID = 'universal-import';
/** Mirrors config/importConversion.ts: the org-wide AI Conversion kill switch. */
export const IMPORT_CONVERSION_SETTINGS_DOC = 'import_conversion';

export interface ConversionDeps {
  db: Firestore;
  /** This widget's AI switch and daily limit (`admin_settings/import_conversion`). */
  aiAccess: (target: ConversionRequest['target']) => Promise<ImportAiAccess>;
  isAdmin: (token: Token) => Promise<boolean>;
  /** Neither `gemini-functions` nor `universal-import` is switched off. */
  flagsOn: () => Promise<boolean>;
  /** Board only: the Magic Layout (`dashboard-layout`) flag lets this caller in. */
  layoutAllowed: (
    token: Token,
    uid: string,
    isAdmin: boolean
  ) => Promise<boolean>;
  isStaff: (token: Token) => Promise<boolean>;
  /** Non-admins: the universal-import flag grants this caller, by the same rules as Send. */
  granted: (token: Token, uid: string) => Promise<boolean>;
  charge: (
    token: Token,
    uid: string,
    cap: AiExtraCap
  ) => Promise<AiUsageCharge>;
  refund: (charge: AiUsageCharge) => Promise<void>;
  record: (token: Token, uid: string, key: string) => Promise<AiUsageCharge>;
  maxInputChars: (integration: AiIntegrationId) => Promise<number>;
  generate: (
    integration: AiIntegrationId,
    prompt: ReturnType<typeof buildConversionPrompt>
  ) => Promise<string>;
}

/** The widget's AI switch, staff, then the flag and quota, then one model call; a failed call refunds its charge. */
export async function runConversion(
  req: ConversionRequest,
  uid: string,
  token: Token,
  deps: ConversionDeps
): Promise<ConversionResult> {
  const access = await deps.aiAccess(req.target);
  if (!access.on) {
    throw new HttpsError(
      'failed-precondition',
      'AI conversion is turned off by an administrator.'
    );
  }
  const isAdmin = await deps.isAdmin(token);
  if (isAdmin && !(await deps.flagsOn())) {
    throw new HttpsError(
      'permission-denied',
      'Import with AI is turned off by an administrator.'
    );
  }
  if (!isAdmin && !(await deps.isStaff(token))) {
    throw new HttpsError(
      'permission-denied',
      'Only district staff can import with AI.'
    );
  }
  if (!isAdmin && !(await deps.granted(token, uid))) {
    throw new HttpsError(
      'permission-denied',
      'Import is not turned on for your account.'
    );
  }
  // Checked before the charge, so a bad widget list costs nothing.
  const allowed =
    req.target === 'board' ? readAllowedWidgets(req.allowedWidgets) : null;
  if (
    req.target === 'board' &&
    !(await deps.layoutAllowed(token, uid, isAdmin))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Building boards with AI is turned off by an administrator.'
    );
  }
  const integration = CONVERSION_INTEGRATION[req.target];
  const charge = isAdmin
    ? await deps.record(token, uid, access.usageKey)
    : await deps.charge(token, uid, {
        key: access.usageKey,
        limit: access.limit,
        message: access.limitMessage,
      });
  let modelReplied = false;
  try {
    const fitted = fitSourceText(
      req.source.text,
      await deps.maxInputChars(integration)
    );
    const source = { ...req.source, text: fitted.text };
    const text = await deps.generate(
      integration,
      buildConversionPrompt({ ...req, source }, allowed)
    );
    modelReplied = true;
    const truncated = fitted.truncated || req.clipped;
    switch (req.target) {
      case 'flashcards':
        return {
          target: 'flashcards',
          ...parseFlashcardsResponse(text, source),
          truncated,
        };
      case 'activityWall':
        return {
          target: 'activityWall',
          ...parseActivityWallResponse(text, source),
          truncated,
        };
      case 'board':
        return {
          target: 'board',
          ...parseBoardResponse(text, source, allowed),
          truncated,
        };
    }
  } catch (error) {
    // A reply that fails to parse stays charged; a failure before or in the call refunds.
    if (!modelReplied && charge.docIds.length > 0) {
      await deps.refund(charge).catch(() => undefined);
    }
    if (error instanceof HttpsError) throw error;
    console.error('[importConvertV1] failed:', safeErr(error));
    throw new HttpsError(
      'internal',
      'The AI could not convert this. Try again.'
    );
  }
}

/** Admins skip the quota, but a flag switched off still stops them. */
export async function importFlagsOn(db: Firestore): Promise<boolean> {
  const flags = await Promise.all(
    ['gemini-functions', UNIVERSAL_IMPORT_FEATURE_ID].map((id) =>
      db.collection('global_permissions').doc(id).get()
    )
  );
  return flags.every((d) => d.data()?.enabled !== false);
}

const verifiedEmail = (token: Token): string | null =>
  token.email_verified === true && token.email
    ? token.email.toLowerCase()
    : null;

/** The Magic Layout flag for this caller: open when no doc is saved, as its default is public. */
export async function layoutFlagAllows(
  db: Firestore,
  token: Token,
  uid: string,
  isAdmin: boolean
): Promise<boolean> {
  const perm = (
    await db.collection('global_permissions').doc('dashboard-layout').get()
  ).data();
  if (!perm) return true;
  if (perm.enabled === false) return false;
  if (isExcludedFrom(perm, verifiedEmail(token))) return false;
  if (isAdmin) return true;
  const { isGlobalFeatureGranted } = await import('./featureGrant');
  return isGlobalFeatureGranted(
    db,
    'dashboard-layout',
    verifiedEmail(token),
    uid
  );
}

function defaultDeps(): ConversionDeps {
  const db = admin.firestore();
  return {
    db,
    aiAccess: async (target) => {
      const [settings, flag] = await Promise.all([
        db
          .collection('admin_settings')
          .doc(IMPORT_CONVERSION_SETTINGS_DOC)
          .get(),
        db
          .collection('global_permissions')
          .doc(UNIVERSAL_IMPORT_FEATURE_ID)
          .get(),
      ]);
      return importAiAccess(
        settings.data(),
        target,
        (flag.data() as { config?: { dailyLimit?: unknown } } | undefined)
          ?.config?.dailyLimit
      );
    },
    isAdmin: (token) =>
      resolveCallerIsAdminFor(db, token, [
        'gemini-functions',
        UNIVERSAL_IMPORT_FEATURE_ID,
      ]),
    flagsOn: () => importFlagsOn(db),
    layoutAllowed: (token, uid, isAdmin) =>
      layoutFlagAllows(db, token, uid, isAdmin),
    isStaff: (token) => isDistrictStaffToken(db, token),
    granted: async (token, uid) => {
      const { isGlobalFeatureGranted } = await import('./featureGrant');
      return isGlobalFeatureGranted(
        db,
        UNIVERSAL_IMPORT_FEATURE_ID,
        verifiedEmail(token),
        uid
      );
    },
    // Each widget's own limit replaces the old Import anything limit.
    charge: (token, uid, cap) =>
      enforceAiFeatureAccess(
        db,
        token,
        uid,
        UNIVERSAL_IMPORT_FEATURE_ID,
        false,
        cap,
        true,
        true
      ),
    refund: (charge) => refundAiUsage(db, charge),
    record: (token, uid, key) =>
      recordAiUsage(db, token, uid, UNIVERSAL_IMPORT_FEATURE_ID, key),
    maxInputChars: async (integration) =>
      maxInputCharsFor(
        integration,
        (await getAiModelConfig(db)).integrationLimits
      ),
    generate: async (integration, prompt) => {
      const result = await generateAi(db, {
        integration,
        parts: [{ text: prompt.userText }],
        systemInstruction: prompt.systemInstruction,
        responseMimeType: 'application/json',
        ...(prompt.responseSchema
          ? { responseSchema: prompt.responseSchema }
          : {}),
        temperature: 0.2,
        claudeTimeoutMs: 180_000,
      });
      if (result.stopped !== 'complete') {
        throw new Error(
          `${result.model} stopped early: ${result.finishReason}`
        );
      }
      if (!result.text) throw new Error('Empty response from the AI model.');
      return result.text;
    },
  };
}

export const importConvertV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    await assertViewAsAllowed(request, { outward: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return runConversion(
      parseConversionRequest(request.data),
      request.auth.uid,
      request.auth.token,
      defaultDeps()
    );
  }
);
