// Schoology LTI 1.3 — AGS line-item client for SpartBoard-created gradebook columns.
//
// A column SpartBoard creates is a line item in the section's container. Every URL
// is built from the section id or returned by Schoology, and each one must pass
// `isSchoologyServiceUrl` before a bearer token is sent to it.

import {
  OPAQUE_REDIRECT_TYPE,
  SCHOOLOGY_LTI_SERVICE_HOST,
  SCHOOLOGY_TOOL_ID,
} from './config';

const NET_TIMEOUT_MS = 15000;
const LINEITEM_TYPE = 'application/vnd.ims.lis.v2.lineitem+json';
const LINEITEM_CONTAINER_TYPE =
  'application/vnd.ims.lis.v2.lineitemcontainer+json';
const SERVICES_PATH = `/lti-service/tool/${SCHOOLOGY_TOOL_ID}/services/`;
const SECTION_ID_RE = /^\d{1,20}$/;

/** Tag on every column SpartBoard creates, so a list call can find its own. */
export const TOOL_COLUMN_TAG = 'spartboard';

export interface SchoologySectionUrls {
  lineitemsUrl: string;
  membershipUrl: string;
}

/** True for a Schoology section id (digits only), the only shape a URL is built from. */
export function isSchoologySectionId(contextId: string): boolean {
  return SECTION_ID_RE.test(contextId);
}

/** The AGS line-item container and NRPS membership URLs for a section. */
export function schoologySectionUrls(contextId: string): SchoologySectionUrls {
  if (!isSchoologySectionId(contextId)) {
    throw new Error('Invalid Schoology section id.');
  }
  const base = `https://${SCHOOLOGY_LTI_SERVICE_HOST}${SERVICES_PATH}`;
  return {
    lineitemsUrl: `${base}assignment-grade/v2p0/sections/${contextId}/lineitems`,
    membershipUrl: `${base}names-roles/v2p0/membership/${contextId}`,
  };
}

/** True only for an https URL on Schoology's LTI service under SpartBoard's tool id. */
export function isSchoologyServiceUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === SCHOOLOGY_LTI_SERVICE_HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.pathname.startsWith(SERVICES_PATH)
  );
}

/** Schoology's REST id for a line item: the last path segment of its URL. */
export function lineItemColumnId(lineitemUrl: string): string | null {
  try {
    const last = new URL(lineitemUrl).pathname
      .replace(/\/+$/, '')
      .split('/')
      .pop();
    return last && /^\d{1,20}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

export interface LineItem {
  /** The line item's own URL. */
  id: string;
  label: string;
  scoreMaximum: number;
  resourceId?: string;
  tag?: string;
  [key: string]: unknown;
}

/** A non-2xx (or refused-redirect, or network) failure from the AGS service. */
export class AgsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly isRedirect: boolean
  ) {
    super(message);
    this.name = 'AgsRequestError';
  }
}

function assertServiceUrl(url: string): void {
  if (!isSchoologyServiceUrl(url)) {
    throw new AgsRequestError('Refused a non-Schoology AGS URL.', 0, false);
  }
}

async function agsFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  accessToken: string,
  opts: { accept?: string; body?: unknown } = {}
): Promise<{ status: number; json: unknown }> {
  assertServiceUrl(url);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(opts.accept ? { Accept: opts.accept } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': LINEITEM_TYPE } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
      // SSRF guard, as in ags.ts: never follow a redirect with the bearer token.
      redirect: 'manual',
    });
  } catch (err) {
    console.warn(`[agsLineItems] ${method} failed (network/timeout):`, err);
    throw new AgsRequestError(`AGS ${method} failed (network)`, 0, false);
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const isRedirect = res.type === OPAQUE_REDIRECT_TYPE;
    throw new AgsRequestError(
      isRedirect
        ? `AGS ${method} refused redirect (SSRF guard)`
        : `AGS ${method} failed (${res.status})`,
      res.status,
      isRedirect
    );
  }
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, json };
}

function toLineItem(raw: unknown): LineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isSchoologyServiceUrl(r.id)) return null;
  return {
    ...r,
    id: r.id,
    label: typeof r.label === 'string' ? r.label : '',
    scoreMaximum: typeof r.scoreMaximum === 'number' ? r.scoreMaximum : 0,
  };
}

/** The section's SpartBoard columns, optionally filtered by `resource_id` or `tag`. */
export async function listLineItems(
  lineitemsUrl: string,
  accessToken: string,
  filter: { resourceId?: string; tag?: string } = {}
): Promise<LineItem[]> {
  const url = new URL(lineitemsUrl);
  if (filter.resourceId) url.searchParams.set('resource_id', filter.resourceId);
  if (filter.tag) url.searchParams.set('tag', filter.tag);
  const { json } = await agsFetch('GET', url.toString(), accessToken, {
    accept: LINEITEM_CONTAINER_TYPE,
  });
  if (!Array.isArray(json)) return [];
  return json.map(toLineItem).filter((li): li is LineItem => li !== null);
}

export interface NewLineItem {
  label: string;
  resourceId: string;
  scoreMaximum: number;
}

/** Create a column. Schoology ignores due dates and categories sent here. */
export async function createLineItem(
  lineitemsUrl: string,
  accessToken: string,
  item: NewLineItem
): Promise<LineItem> {
  const { json } = await agsFetch('POST', lineitemsUrl, accessToken, {
    accept: LINEITEM_TYPE,
    body: {
      label: item.label,
      resourceId: item.resourceId,
      tag: TOOL_COLUMN_TAG,
      scoreMaximum: item.scoreMaximum,
    },
  });
  const created = toLineItem(json);
  if (!created) {
    throw new AgsRequestError('AGS create returned no line item.', 0, false);
  }
  return created;
}

/** Read one column; null when Schoology no longer has it. */
export async function getLineItem(
  lineitemUrl: string,
  accessToken: string
): Promise<LineItem | null> {
  try {
    const { json } = await agsFetch('GET', lineitemUrl, accessToken, {
      accept: LINEITEM_TYPE,
    });
    return toLineItem(json);
  } catch (err) {
    if (err instanceof AgsRequestError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Set a column's total. Reads it first and PUTs the full body back with only
 * `scoreMaximum` changed, so a title the teacher edited in Schoology survives.
 */
export async function updateLineItemMaximum(
  lineitemUrl: string,
  accessToken: string,
  scoreMaximum: number
): Promise<'updated' | 'unchanged' | 'not-found'> {
  const current = await getLineItem(lineitemUrl, accessToken);
  if (!current) return 'not-found';
  if (current.scoreMaximum === scoreMaximum) return 'unchanged';
  try {
    await agsFetch('PUT', lineitemUrl, accessToken, {
      accept: LINEITEM_TYPE,
      body: { ...current, id: lineitemUrl, scoreMaximum },
    });
  } catch (err) {
    if (err instanceof AgsRequestError && err.status === 404) {
      return 'not-found';
    }
    throw err;
  }
  return 'updated';
}

/** Remove a column; a column that's already gone counts as removed. */
export async function deleteLineItem(
  lineitemUrl: string,
  accessToken: string
): Promise<'deleted' | 'not-found'> {
  try {
    await agsFetch('DELETE', lineitemUrl, accessToken);
  } catch (err) {
    if (err instanceof AgsRequestError && err.status === 404) {
      return 'not-found';
    }
    throw err;
  }
  return 'deleted';
}
