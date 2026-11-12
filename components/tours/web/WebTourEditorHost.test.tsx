import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebTourEditorHost } from './WebTourEditorHost';

describe('WebTourEditorHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('forwards an old board link to the Web tours page', () => {
    const replace = vi.fn();
    window.history.replaceState(null, '', '/?edit-web-tour=set_1');
    vi.stubGlobal('location', {
      href: window.location.href,
      origin: window.location.origin,
      replace,
    });
    render(<WebTourEditorHost />);
    expect(replace).toHaveBeenCalledWith(
      `${window.location.origin}/web-tours?edit-web-tour=set_1`
    );
  });
});
