// create_guided_learning: new personal or building sets, including live tours (CLAUDE_CONNECTOR.md CC-D18).
import { randomUUID } from 'node:crypto';
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ToolError,
  logActivity,
  reserveWrite,
  type ToolContext,
} from './activity';
import { createGuidedLearningJson, driveTokenFor } from './drive';
import {
  BUILDING,
  MAX_DOC_BYTES,
  MAX_STEPS,
  PERSONAL,
  assertAccess,
  mergeSteps,
  requiredSchemaVersion,
  stepInput,
  type GlSet,
  type Step,
  type StepInput,
} from './glTools';
import {
  planAnchorRequests,
  queueAnchorRequests,
  type AnchorRequest,
  type MissingAnchorNote,
} from './glAnchorRequests';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { CREATES, run } from './toolKit';

export const MAX_NEW_SLIDES = 10;
const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface CreateInput {
  kind: 'live_tour' | 'standard';
  source?: 'mine' | 'building';
  title: string;
  description?: string;
  mode?: 'structured' | 'guided' | 'explore';
  welcome_enabled?: boolean;
  welcome_message?: string;
  slide_urls?: string[];
  tour_widgets?: string[];
  steps: StepInput[];
}

/** Where the set is saved: live tours run only from building sets. */
export function createSource(input: CreateInput): 'mine' | 'building' {
  if (input.kind === 'live_tour') {
    if (input.source === 'mine')
      throw new ToolError(
        'Live tours run only from building sets. Leave source out or use "building".'
      );
    return 'building';
  }
  return input.source ?? 'mine';
}

/** Checks the request against the kind's rules and returns the validated steps. */
export function validateCreate(input: CreateInput): Step[] {
  const slideCount = input.slide_urls?.length ?? 0;
  if (input.kind === 'standard') {
    if (slideCount === 0)
      throw new ToolError(
        'A standard activity needs at least one slide in slide_urls.'
      );
    if (input.tour_widgets?.length)
      throw new ToolError('tour_widgets applies only to live tours.');
    const bound = input.steps.findIndex((s) => s.tour || s.missing_anchor);
    if (bound >= 0)
      throw new ToolError(
        `steps[${bound}]: tour and missing_anchor apply only to live tours.`
      );
  } else if (!input.steps.some((s) => s.tour)) {
    throw new ToolError(
      'A live tour needs at least one step with a tour binding. Use list_tour_anchors.'
    );
  }
  const unknown = input.tour_widgets?.find((t) => !WIDGET_TYPES.has(t));
  if (unknown)
    throw new ToolError(
      `tour_widgets: "${unknown}" is not a widget type. Use one of: ${WIDGET_TYPE_LIST.join(', ')}.`
    );
  input.steps.forEach((s, i) => {
    if (s.imageIndex >= Math.max(slideCount, 1))
      throw new ToolError(
        slideCount === 0
          ? `steps[${i}].imageIndex must be 0 when there are no slides.`
          : `steps[${i}].imageIndex ${s.imageIndex} is past the last slide (${slideCount - 1}).`
      );
  });
  return mergeSteps([], input.steps, Math.max(slideCount, 1));
}

/** The stored set; undefined fields are left out because Firestore refuses them. */
export function buildNewSet(
  input: CreateInput,
  ids: { id: string; uid: string; now: number },
  source: 'mine' | 'building',
  steps: Step[],
  slides: { urls: string[]; paths: string[] }
): GlSet {
  const set: GlSet = {
    id: ids.id,
    schemaVersion: requiredSchemaVersion(steps),
    title: input.title.trim(),
    imageUrls: slides.urls,
    steps,
    mode: input.mode ?? 'structured',
    createdAt: ids.now,
    updatedAt: ids.now,
    claudeCreatedAt: ids.now,
  };
  if (slides.paths.length > 0) set.imagePaths = slides.paths;
  if (input.description?.trim()) set.description = input.description.trim();
  if (input.welcome_enabled) set.welcomeEnabled = true;
  if (input.welcome_message?.trim())
    set.welcomeMessage = input.welcome_message.trim();
  if (source === 'building') {
    set.isBuilding = true;
    set.authorUid = ids.uid;
    set.hasLiveTour = steps.some((s) => !!s.tour);
  }
  if (input.kind === 'live_tour')
    set.tourSetup = { widgets: [...new Set(input.tour_widgets ?? [])] };
  return set;
}

/** Copies each slide into the creator's Guided Learning uploads, marked so the sweep reclaims it if the save fails. */
async function uploadSlides(
  ctx: ToolContext,
  urls: readonly string[]
): Promise<{ urls: string[]; paths: string[] }> {
  const { downloadPublicImage } = await import('../fetchImportImage');
  const images = await Promise.all(
    urls.map(async (url, i) => {
      try {
        return await downloadPublicImage(url);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'It failed.';
        throw new ToolError(`slide_urls[${i}] could not be copied: ${reason}`);
      }
    })
  );
  const bucket = admin.storage().bucket();
  const stamp = Date.now();
  const saved = await Promise.all(
    images.map(async ({ contentType, body }, i) => {
      const path = `users/${ctx.uid}/hotspot_images/${stamp}-claude-${i + 1}.${EXTENSIONS[contentType]}`;
      const token = randomUUID();
      await bucket.file(path).save(body, {
        resumable: false,
        contentType,
        metadata: {
          metadata: { glMedia: '1', firebaseStorageDownloadTokens: token },
        },
      });
      return {
        path,
        url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
      };
    })
  );
  return { urls: saved.map((s) => s.url), paths: saved.map((s) => s.path) };
}

const WHERE = {
  mine: 'SpartBoard > Guided Learning widget > library',
  building: 'SpartBoard > Guided Learning widget > library, building sets',
};

export function registerCreateGuidedLearning(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'create_guided_learning',
    {
      title: 'Create a Guided Learning set',
      description:
        'Creates a Guided Learning set. kind "live_tour" walks a teacher through the real SpartBoard board: bind steps with tour (list_tour_anchors), saved as an unpublished building set (admins only) that an admin publishes in the Studio. kind "standard" is a hotspot activity on slide images: pass public https image links in slide_urls, which are copied into SpartBoard. Step rules match update_guided_learning; xPct/yPct are % of the slide (50/50 when there is none).',
      inputSchema: {
        kind: z.enum(['live_tour', 'standard']),
        source: z
          .enum(['mine', 'building'])
          .optional()
          .describe(
            'Standard sets: "mine" (default) or "building" (admins). Live tours are always building.'
          ),
        title: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        mode: z.enum(['structured', 'guided', 'explore']).optional(),
        welcome_enabled: z.boolean().optional(),
        welcome_message: z.string().max(300).optional(),
        slide_urls: z
          .array(z.string().max(2000))
          .max(MAX_NEW_SLIDES)
          .optional()
          .describe(
            'PNG, JPEG, GIF or WebP links in slide order; step imageIndex counts from 0. Optional on a live tour, where a slide shows when its control is missing.'
          ),
        tour_widgets: z
          .array(z.string().max(60))
          .max(12)
          .optional()
          .describe(
            'Live tours: widget types added to the board before the tour starts, e.g. "clock".'
          ),
        steps: z.array(stepInput).min(1).max(MAX_STEPS),
      },
      annotations: CREATES,
    },
    (input) =>
      run('create_guided_learning', ctx, async () => {
        const source = createSource(input);
        await assertAccess(ctx, source);
        const steps = validateCreate(input);
        let requests: AnchorRequest[] = [];
        let planned = steps;
        if (source === 'building') {
          const notes = new Map<string, MissingAnchorNote>();
          for (const s of input.steps)
            if (s.missing_anchor) notes.set(s.id, s.missing_anchor);
          const plan = planAnchorRequests(steps, [], notes);
          planned = plan.steps as Step[];
          requests = plan.requests;
        } else if (input.steps.some((s) => s.missing_anchor)) {
          throw new ToolError('missing_anchor applies only to building sets.');
        }
        const token = source === 'mine' ? await driveTokenFor(ctx.uid) : null;
        await reserveWrite(ctx);
        const slides = await uploadSlides(ctx, input.slide_urls ?? []);
        const now = Date.now();
        const set = buildNewSet(
          input,
          { id: randomUUID(), uid: ctx.uid, now },
          source,
          planned,
          slides
        );
        if (Buffer.byteLength(JSON.stringify(set)) > MAX_DOC_BYTES)
          throw new ToolError('The set is too large to save.');
        const batch = ctx.db.batch();
        logActivity(ctx, batch, {
          action: 'create',
          itemType: 'guided_learning',
          itemId: set.id,
          title: set.title,
        });
        let anchorsRequested = 0;
        if (source === 'building') {
          anchorsRequested = await queueAnchorRequests(
            ctx.db,
            batch,
            set.id,
            requests
          );
          batch.create(ctx.db.doc(`${BUILDING}/${set.id}`), set);
        } else {
          const driveFileId = await createGuidedLearningJson(
            token as string,
            set
          );
          batch.create(ctx.db.doc(`users/${ctx.uid}/${PERSONAL}/${set.id}`), {
            id: set.id,
            title: set.title,
            ...(set.description ? { description: set.description } : {}),
            stepCount: set.steps.length,
            mode: set.mode,
            imageUrl: set.imageUrls[0] ?? '',
            driveFileId,
            createdAt: now,
            updatedAt: now,
            claudeCreatedAt: now,
            ...(slides.paths.length > 0 ? { imagePaths: slides.paths } : {}),
            driveFileIds: [],
          });
        }
        await batch.commit();
        return {
          set_id: set.id,
          source,
          title: set.title,
          step_count: set.steps.length,
          slide_count: set.imageUrls.length,
          where_to_find_it: WHERE[source],
          ...(anchorsRequested > 0
            ? {
                anchors_requested: anchorsRequested,
                anchors_note:
                  'Controls with no anchor were sent to a developer to tag.',
              }
            : {}),
          note:
            input.kind === 'live_tour'
              ? 'Saved as a draft. Admins can try it with Run live on my board (draft) in the library; teachers see it after it is published in the Studio.'
              : 'Saved. Open it in the Guided Learning Studio to check placement.',
        };
      })
  );
}
