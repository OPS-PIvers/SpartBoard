import { describe, it, expect } from 'vitest';
import {
  buildQuizContentItem,
  buildDeepLinkResponseClaims,
  dueAtToSubmissionEndDateTime,
  isSchoologyReturnUrl,
  MESSAGE_TYPE_DL_RESPONSE,
} from './deepLink';
import { LTI } from './config';

describe('buildQuizContentItem', () => {
  it('builds an ltiResourceLink with custom params and a line item', () => {
    const item = buildQuizContentItem({
      launchUrl: 'https://spartboard.web.app/lti/launch',
      title: 'Quiz A',
      custom: { kind: 'quiz', quiz_code: 'ABC123' },
      maxPoints: 15,
    });
    expect(item).toEqual({
      type: 'ltiResourceLink',
      url: 'https://spartboard.web.app/lti/launch',
      title: 'Quiz A',
      custom: { kind: 'quiz', quiz_code: 'ABC123' },
      lineItem: { scoreMaximum: 15, label: 'Quiz A' },
    });
  });

  it('omits the line item when maxPoints is missing or zero', () => {
    expect(
      buildQuizContentItem({ launchUrl: 'u', title: 't', custom: {} }).lineItem
    ).toBeUndefined();
    expect(
      buildQuizContentItem({
        launchUrl: 'u',
        title: 't',
        custom: {},
        maxPoints: 0,
      }).lineItem
    ).toBeUndefined();
  });

  it('sets submission.endDateTime (the due date) when dueAtMs is given', () => {
    // The client sends an absolute instant (local end-of-day). The builder
    // serializes it verbatim — here, 11:59 PM Central on 2026-06-01 (CDT) is
    // 04:59:59Z on 2026-06-02.
    const item = buildQuizContentItem({
      launchUrl: 'u',
      title: 't',
      custom: {},
      maxPoints: 10,
      dueAtMs: Date.UTC(2026, 5, 2, 4, 59, 59),
    });
    expect(item.submission).toEqual({
      endDateTime: '2026-06-02T04:59:59.000Z',
    });
  });

  it('omits submission when dueAtMs is absent or invalid', () => {
    expect(
      buildQuizContentItem({ launchUrl: 'u', title: 't', custom: {} })
        .submission
    ).toBeUndefined();
    expect(
      buildQuizContentItem({
        launchUrl: 'u',
        title: 't',
        custom: {},
        dueAtMs: 0,
      }).submission
    ).toBeUndefined();
  });
});

describe('dueAtToSubmissionEndDateTime', () => {
  it('serializes the absolute due instant to ISO 8601 (no TZ assumption)', () => {
    // The client resolves the local-timezone end-of-day to an absolute instant;
    // the server serializes it verbatim. 11:59 PM Central on 2026-06-01 (CDT) is
    // 04:59:59Z on 2026-06-02.
    expect(dueAtToSubmissionEndDateTime(Date.UTC(2026, 5, 2, 4, 59, 59))).toBe(
      '2026-06-02T04:59:59.000Z'
    );
    // 11:59 PM Central on 2026-12-24 (CST, UTC-6) is 05:59:59Z on 2026-12-25.
    expect(
      dueAtToSubmissionEndDateTime(Date.UTC(2026, 11, 25, 5, 59, 59))
    ).toBe('2026-12-25T05:59:59.000Z');
  });

  it('returns null for absent or invalid input', () => {
    expect(dueAtToSubmissionEndDateTime(undefined)).toBeNull();
    expect(dueAtToSubmissionEndDateTime(0)).toBeNull();
    expect(dueAtToSubmissionEndDateTime(-1)).toBeNull();
    expect(dueAtToSubmissionEndDateTime(Number.NaN)).toBeNull();
    expect(dueAtToSubmissionEndDateTime(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('buildDeepLinkResponseClaims', () => {
  it('sets the DL claims and echoes data', () => {
    const items = [
      buildQuizContentItem({
        launchUrl: 'u',
        title: 't',
        custom: {},
        maxPoints: 10,
      }),
    ];
    const claims = buildDeepLinkResponseClaims({
      deploymentId: 'dep-1',
      nonce: 'nonce-123',
      data: 'opaque-xyz',
      contentItems: items,
    });
    expect(claims[LTI.MESSAGE_TYPE]).toBe(MESSAGE_TYPE_DL_RESPONSE);
    expect(claims[LTI.VERSION]).toBe('1.3.0');
    expect(claims[LTI.DEPLOYMENT_ID]).toBe('dep-1');
    expect(claims[LTI.DL_CONTENT_ITEMS]).toEqual(items);
    expect(claims[LTI.DL_DATA]).toBe('opaque-xyz');
    expect(claims.nonce).toBe('nonce-123');
  });

  it('omits data when absent but still sets a nonce', () => {
    const claims = buildDeepLinkResponseClaims({
      deploymentId: 'd',
      nonce: 'n',
      contentItems: [],
    });
    expect(LTI.DL_DATA in claims).toBe(false);
    expect(claims.nonce).toBe('n');
  });
});

describe('isSchoologyReturnUrl', () => {
  it('accepts https schoology.com hosts', () => {
    expect(
      isSchoologyReturnUrl('https://lti-service.svc.schoology.com/x')
    ).toBe(true);
    expect(isSchoologyReturnUrl('https://schoology.com/return')).toBe(true);
    expect(isSchoologyReturnUrl('https://app.schoology.com/return')).toBe(true);
  });

  it('rejects non-schoology hosts, non-https, and look-alikes', () => {
    expect(isSchoologyReturnUrl('https://evil.com/return')).toBe(false);
    expect(isSchoologyReturnUrl('http://schoology.com')).toBe(false);
    expect(isSchoologyReturnUrl('https://notschoology.com')).toBe(false);
    expect(isSchoologyReturnUrl('https://schoology.com.evil.com')).toBe(false);
    expect(isSchoologyReturnUrl('not a url')).toBe(false);
  });
});
