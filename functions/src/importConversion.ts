// Import's AI Conversions callable: Flashcards, Activity Wall prompt and Board from a Source (docs/plans/IMPORT.md D8, D10, D11, D28).
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  enforceAiFeatureAccess,
  recordAiUsage,
  refundAiUsage,
  resolveCallerIsAdmin,
  type AiUsageCharge,
} from './aiGeneration';
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
  /** The AI Conversion kill switch is on (`admin_settings/import_conversion.enabled`). */
  switchOn: () => Promise<boolean>;
  isAdmin: (token: Token) => Promise<boolean>;
  /** Neither `gemini-functions` nor `universal-import` is switched off. */
  flagsOn: () => Promise<boolean>;
  /** Board only: the Magic Layout (`dashboard-layout`) flag lets this caller in. */
  layoutAllowed: (token: Token, isAdmin: boolean) => Promise<boolean>;
  isStaff: (token: Token) => Promise<boolean>;
  charge: (token: Token, uid: string) => Promise<AiUsageCharge>;
  refund: (charge: AiUsageCharge) => Promise<void>;
  record: (token: Token, uid: string) => Promise<AiUsageCharge>;
  maxInputChars: (integration: AiIntegrationId) => Promise<number>;
  generate: (
    integration: AiIntegrationId,
    prompt: ReturnType<typeof buildConversionPrompt>
  ) => Promise<string>;
}

/** Kill switch, staff, then the flag and quota, then one model call; a failed call refunds its charge. */
export async function runConversion(
  req: ConversionRequest,
  uid: string,
  token: Token,
  deps: ConversionDeps
): Promise<ConversionResult> {
  if (!(await deps.switchOn())) {
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
  // Checked before the charge, so a bad widget list costs nothing.
  const allowed =
    req.target === 'board' ? readAllowedWidgets(req.allowedWidgets) : null;
  if (req.target === 'board' && !(await deps.layoutAllowed(token, isAdmin))) {
    throw new HttpsError(
      'permission-denied',
      'Building boards with AI is turned off by an administrator.'
    );
  }
  const integration = CONVERSION_INTEGRATION[req.target];
  const charge = isAdmin
    ? await deps.record(token, uid)
    : await deps.charge(token, uid);
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
    const truncated = fitted.truncated;
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
    if (charge.docIds.length > 0) {
      await deps.refund(charge).catch(() => undefined);
    }
    if (error instanceof HttpsError) throw error;
    console.error('[importConvertV1] failed:', error);
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

/** The Magic Layout flag for this caller: open when no doc is saved, as its default is public. */
export async function layoutFlagAllows(
  db: Firestore,
  token: Token,
  isAdmin: boolean
): Promise<boolean> {
  const perm = (
    await db.collection('global_permissions').doc('dashboard-layout').get()
  ).data();
  if (!perm) return true;
  if (perm.enabled === false) return false;
  if (isAdmin) return true;
  if (perm.accessLevel === 'admin') return false;
  if (perm.accessLevel === 'beta') {
    const email =
      token.email_verified === true ? token.email?.toLowerCase() : '';
    const beta = Array.isArray(perm.betaUsers) ? perm.betaUsers : [];
    return !!email && beta.some((u) => String(u).toLowerCase() === email);
  }
  return true;
}

function defaultDeps(): ConversionDeps {
  const db = admin.firestore();
  return {
    db,
    switchOn: async () =>
      (
        await db
          .collection('admin_settings')
          .doc(IMPORT_CONVERSION_SETTINGS_DOC)
          .get()
      ).data()?.enabled === true,
    isAdmin: (token) => resolveCallerIsAdmin(db, token),
    flagsOn: () => importFlagsOn(db),
    layoutAllowed: (token, isAdmin) => layoutFlagAllows(db, token, isAdmin),
    isStaff: (token) => isDistrictStaffToken(db, token),
    charge: (token, uid) =>
      enforceAiFeatureAccess(
        db,
        token,
        uid,
        UNIVERSAL_IMPORT_FEATURE_ID,
        false
      ),
    refund: (charge) => refundAiUsage(db, charge),
    record: (token, uid) =>
      recordAiUsage(db, token, uid, UNIVERSAL_IMPORT_FEATURE_ID),
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
    assertViewAsAllowed(request, { outward: true });
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
