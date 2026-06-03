// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  parseHandoffMessage,
  DL_HANDOFF_READY,
  DL_HANDOFF_CONTEXT,
  DL_HANDOFF_RESPONSE,
} from './deepLinkHandoff';

const ORIGIN = window.location.origin;

function evt(data: unknown, origin: string = ORIGIN): MessageEvent {
  return new MessageEvent('message', { data, origin });
}

describe('parseHandoffMessage', () => {
  it('accepts a READY message from our origin', () => {
    expect(parseHandoffMessage(evt({ type: DL_HANDOFF_READY }))).toEqual({
      type: DL_HANDOFF_READY,
    });
  });

  it('accepts a well-formed CONTEXT message (with optional dlData)', () => {
    const context = {
      returnUrl: 'https://schoology.example/return',
      dlData: 'opaque',
      contextId: '7595131723',
    };
    expect(
      parseHandoffMessage(evt({ type: DL_HANDOFF_CONTEXT, context }))
    ).toEqual({ type: DL_HANDOFF_CONTEXT, context });
  });

  it('accepts a CONTEXT message without dlData', () => {
    const context = {
      returnUrl: 'https://schoology.example/return',
      contextId: '7595131723',
    };
    expect(
      parseHandoffMessage(evt({ type: DL_HANDOFF_CONTEXT, context }))
    ).toEqual({ type: DL_HANDOFF_CONTEXT, context });
  });

  it('rejects a CONTEXT message missing returnUrl or contextId', () => {
    expect(
      parseHandoffMessage(
        evt({ type: DL_HANDOFF_CONTEXT, context: { contextId: 'x' } })
      )
    ).toBeNull();
    expect(
      parseHandoffMessage(
        evt({
          type: DL_HANDOFF_CONTEXT,
          context: { returnUrl: 'https://x' },
        })
      )
    ).toBeNull();
  });

  it('accepts a well-formed RESPONSE message', () => {
    const response = {
      jwt: 'eyJ...',
      returnUrl: 'https://schoology.example/r',
    };
    expect(
      parseHandoffMessage(evt({ type: DL_HANDOFF_RESPONSE, response }))
    ).toEqual({ type: DL_HANDOFF_RESPONSE, response });
  });

  it('rejects a RESPONSE message missing jwt', () => {
    expect(
      parseHandoffMessage(
        evt({ type: DL_HANDOFF_RESPONSE, response: { returnUrl: 'https://x' } })
      )
    ).toBeNull();
  });

  it('rejects messages from a foreign origin (the core security check)', () => {
    expect(
      parseHandoffMessage(
        evt({ type: DL_HANDOFF_READY }, 'https://evil.example')
      )
    ).toBeNull();
    const context = { returnUrl: 'https://x', contextId: 'y' };
    expect(
      parseHandoffMessage(
        evt({ type: DL_HANDOFF_CONTEXT, context }, 'https://evil.example')
      )
    ).toBeNull();
  });

  it('rejects non-object / unknown-type payloads', () => {
    expect(parseHandoffMessage(evt(null))).toBeNull();
    expect(parseHandoffMessage(evt('a string'))).toBeNull();
    expect(parseHandoffMessage(evt({ type: 'something-else' }))).toBeNull();
    expect(parseHandoffMessage(evt({}))).toBeNull();
  });
});
