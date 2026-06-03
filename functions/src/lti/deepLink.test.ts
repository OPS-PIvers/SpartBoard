import { describe, it, expect } from 'vitest';
import {
  buildQuizContentItem,
  buildDeepLinkResponseClaims,
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
      data: 'opaque-xyz',
      contentItems: items,
    });
    expect(claims[LTI.MESSAGE_TYPE]).toBe(MESSAGE_TYPE_DL_RESPONSE);
    expect(claims[LTI.VERSION]).toBe('1.3.0');
    expect(claims[LTI.DEPLOYMENT_ID]).toBe('dep-1');
    expect(claims[LTI.DL_CONTENT_ITEMS]).toEqual(items);
    expect(claims[LTI.DL_DATA]).toBe('opaque-xyz');
  });

  it('omits data when absent', () => {
    const claims = buildDeepLinkResponseClaims({
      deploymentId: 'd',
      contentItems: [],
    });
    expect(LTI.DL_DATA in claims).toBe(false);
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
