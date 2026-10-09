import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AgsRequestError,
  createLineItem,
  deleteLineItem,
  getLineItem,
  isSchoologyServiceUrl,
  lineItemColumnId,
  listLineItems,
  schoologySectionUrls,
  updateLineItemMaximum,
} from './lineItems';

const SECTION = '7660186912';
const { lineitemsUrl, membershipUrl } = schoologySectionUrls(SECTION);
const ITEM_URL = `${lineitemsUrl}/8604205395`;

type FetchArgs = [string, RequestInit | undefined];

function stubFetch(...responses: Response[]) {
  const fn = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('schoologySectionUrls', () => {
  it('builds both service URLs from the section id', () => {
    expect(lineitemsUrl).toBe(
      'https://lti-service.svc.schoology.com/lti-service/tool/8409082949/services/assignment-grade/v2p0/sections/7660186912/lineitems'
    );
    expect(membershipUrl).toBe(
      'https://lti-service.svc.schoology.com/lti-service/tool/8409082949/services/names-roles/v2p0/membership/7660186912'
    );
  });

  it.each(['', 'abc', '123/../456', '12 3', '1'.repeat(21)])(
    'rejects %j',
    (bad) => {
      expect(() => schoologySectionUrls(bad)).toThrow();
    }
  );
});

describe('isSchoologyServiceUrl', () => {
  it('accepts URLs under the tool on the service host', () => {
    expect(isSchoologyServiceUrl(lineitemsUrl)).toBe(true);
    expect(isSchoologyServiceUrl(ITEM_URL)).toBe(true);
  });

  it.each([
    lineitemsUrl.replace('https:', 'http:'),
    lineitemsUrl.replace('lti-service.svc', 'evil'),
    lineitemsUrl.replace('schoology.com', 'schoology.com.evil.test'),
    lineitemsUrl.replace('8409082949', '1111111111'),
    lineitemsUrl.replace('schoology.com', 'schoology.com:8443'),
    lineitemsUrl.replace('https://', 'https://user:pw@'),
    'not a url',
  ])('rejects %s', (bad) => {
    expect(isSchoologyServiceUrl(bad)).toBe(false);
  });
});

describe('lineItemColumnId', () => {
  it('returns the numeric last path segment', () => {
    expect(lineItemColumnId(ITEM_URL)).toBe('8604205395');
    expect(lineItemColumnId(`${ITEM_URL}/`)).toBe('8604205395');
  });

  it('returns null for a non-numeric segment', () => {
    expect(lineItemColumnId(`${lineitemsUrl}/abc`)).toBeNull();
  });
});

describe('listLineItems', () => {
  it('sends the filter and keeps only Schoology-hosted items', async () => {
    const fetchMock = stubFetch(
      json([
        { id: ITEM_URL, label: 'Quiz', scoreMaximum: 10 },
        { id: 'https://evil.test/x', label: 'Bad', scoreMaximum: 1 },
      ])
    );
    const items = await listLineItems(lineitemsUrl, 'tok', {
      resourceId: 'spartboard:quiz:s1',
    });
    expect(items.map((i) => i.id)).toEqual([ITEM_URL]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${lineitemsUrl}?resource_id=spartboard%3Aquiz%3As1`);
    expect(init?.redirect).toBe('manual');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok'
    );
  });

  it('never sends the token to a foreign host', async () => {
    const fetchMock = stubFetch();
    await expect(
      listLineItems('https://evil.test/lineitems', 'tok')
    ).rejects.toBeInstanceOf(AgsRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createLineItem', () => {
  it('posts label, resource id, tag and total', async () => {
    const fetchMock = stubFetch(
      json({ id: ITEM_URL, label: 'Quiz', scoreMaximum: 10 }, 201)
    );
    const item = await createLineItem(lineitemsUrl, 'tok', {
      label: 'Quiz',
      resourceId: 'spartboard:quiz:s1',
      scoreMaximum: 10,
    });
    expect(item.id).toBe(ITEM_URL);
    const body = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string
    ) as Record<string, unknown>;
    expect(body).toEqual({
      label: 'Quiz',
      resourceId: 'spartboard:quiz:s1',
      tag: 'spartboard',
      scoreMaximum: 10,
    });
  });

  it('throws when Schoology returns an item on another host', async () => {
    stubFetch(json({ id: 'https://evil.test/1', label: 'x' }, 201));
    await expect(
      createLineItem(lineitemsUrl, 'tok', {
        label: 'Quiz',
        resourceId: 'r',
        scoreMaximum: 1,
      })
    ).rejects.toBeInstanceOf(AgsRequestError);
  });

  it('reports a refused redirect', async () => {
    stubFetch(new Response('', { status: 302 }));
    await expect(
      createLineItem(lineitemsUrl, 'tok', {
        label: 'Quiz',
        resourceId: 'r',
        scoreMaximum: 1,
      })
    ).rejects.toMatchObject({ status: 302 });
  });
});

describe('getLineItem', () => {
  it('returns null on 404', async () => {
    stubFetch(new Response('', { status: 404 }));
    await expect(getLineItem(ITEM_URL, 'tok')).resolves.toBeNull();
  });

  it('throws on other failures', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(getLineItem(ITEM_URL, 'tok')).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('updateLineItemMaximum', () => {
  it('puts the full current body back with only the total changed', async () => {
    const current = {
      id: ITEM_URL,
      label: 'Renamed by teacher',
      scoreMaximum: 10,
      resourceId: 'spartboard:quiz:s1',
      tag: 'spartboard',
    };
    const fetchMock = stubFetch(json(current), json({ ...current }, 200));
    await expect(updateLineItemMaximum(ITEM_URL, 'tok', 9)).resolves.toBe(
      'updated'
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(ITEM_URL);
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({
      ...current,
      scoreMaximum: 9,
    });
  });

  it('skips the PUT when the total already matches', async () => {
    const fetchMock = stubFetch(
      json({ id: ITEM_URL, label: 'Quiz', scoreMaximum: 10 })
    );
    await expect(updateLineItemMaximum(ITEM_URL, 'tok', 10)).resolves.toBe(
      'unchanged'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a deleted column', async () => {
    stubFetch(new Response('', { status: 404 }));
    await expect(updateLineItemMaximum(ITEM_URL, 'tok', 9)).resolves.toBe(
      'not-found'
    );
  });
});

describe('deleteLineItem', () => {
  it('deletes, and treats an already-gone column as deleted', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(deleteLineItem(ITEM_URL, 'tok')).resolves.toBe('deleted');
    stubFetch(new Response('', { status: 404 }));
    await expect(deleteLineItem(ITEM_URL, 'tok')).resolves.toBe('not-found');
  });

  it('throws on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(deleteLineItem(ITEM_URL, 'tok')).rejects.toMatchObject({
      status: 0,
    });
  });
});
