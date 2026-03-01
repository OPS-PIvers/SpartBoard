import { describe, it, expect, vi } from 'vitest';
import { getButtonAccessibilityProps } from '../../utils/accessibility';
import React from 'react';

describe('accessibility utility', () => {
  describe('getButtonAccessibilityProps', () => {
    it('returns role, tabIndex, onClick, and onKeyDown', () => {
      const onClick = vi.fn();
      const props = getButtonAccessibilityProps(onClick);

      expect(props.role).toBe('button');
      expect(props.tabIndex).toBe(0);
      expect(props.onClick).toBe(onClick);
      expect(typeof props.onKeyDown).toBe('function');
    });

    it('triggers onClick on Enter key', () => {
      const onClick = vi.fn();
      const props = getButtonAccessibilityProps(onClick);
      const preventDefault = vi.fn();

      props.onKeyDown({
        key: 'Enter',
        preventDefault,
      } as unknown as React.KeyboardEvent);

      expect(preventDefault).toHaveBeenCalled();
      expect(onClick).toHaveBeenCalled();
    });

    it('triggers onClick on Space key', () => {
      const onClick = vi.fn();
      const props = getButtonAccessibilityProps(onClick);
      const preventDefault = vi.fn();

      props.onKeyDown({
        key: ' ',
        preventDefault,
      } as unknown as React.KeyboardEvent);

      expect(preventDefault).toHaveBeenCalled();
      expect(onClick).toHaveBeenCalled();
    });

    it('does not trigger onClick on other keys', () => {
      const onClick = vi.fn();
      const props = getButtonAccessibilityProps(onClick);
      const preventDefault = vi.fn();

      props.onKeyDown({
        key: 'A',
        preventDefault,
      } as unknown as React.KeyboardEvent);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
