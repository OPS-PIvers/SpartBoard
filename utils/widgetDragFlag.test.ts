import { describe, it, expect, beforeEach } from 'vitest';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';

describe('widgetDragFlag', () => {
  beforeEach(() => {
    document.body.className = '';
  });

  describe('beginWidgetDrag', () => {
    it('adds is-dragging-widget class to document.body', () => {
      beginWidgetDrag();
      expect(document.body.classList.contains('is-dragging-widget')).toBe(true);
    });

    it('is idempotent when adding the class', () => {
      beginWidgetDrag();
      beginWidgetDrag();
      expect(document.body.classList.contains('is-dragging-widget')).toBe(true);
      // Ensure no duplicates in classList if possible, though classList.add handles it
      expect(document.body.className).toBe('is-dragging-widget');
    });
  });

  describe('endWidgetDrag', () => {
    it('removes is-dragging-widget class from document.body', () => {
      document.body.classList.add('is-dragging-widget');
      endWidgetDrag();
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });

    it('does not remove other classes from document.body', () => {
      document.body.classList.add('other-class');
      document.body.classList.add('is-dragging-widget');
      endWidgetDrag();
      expect(document.body.classList.contains('other-class')).toBe(true);
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });

    it('does nothing if the class is not present', () => {
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
      endWidgetDrag();
      expect(document.body.classList.contains('is-dragging-widget')).toBe(
        false
      );
    });
  });
});
