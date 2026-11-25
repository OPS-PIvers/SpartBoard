import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from '@/components/common/Modal';
import {
  WidgetAccentContext,
  widgetDialogAccent,
} from '@/components/common/widgetAccentContext';

const dialog = () => screen.getByRole('dialog');

describe('Modal widget accent', () => {
  it('keeps brand blue outside a widget', () => {
    render(
      <Modal isOpen onClose={() => undefined} title="Plain" accent="#be185d">
        body
      </Modal>
    );
    expect(dialog().style.getPropertyValue('--brand-blue-primary')).toBe('');
  });

  it('points brand blue at the widget accent inside a widget', () => {
    render(
      <WidgetAccentContext value="#be185d">
        <Modal isOpen onClose={() => undefined} title="Pink">
          body
        </Modal>
      </WidgetAccentContext>
    );
    expect(dialog().style.getPropertyValue('--brand-blue-primary')).toBe(
      '#be185d'
    );
    expect(dialog().style.getPropertyValue('--brand-blue-lighter')).toContain(
      '#be185d'
    );
  });

  it('prefers the modal’s own accent over the widget’s', () => {
    render(
      <WidgetAccentContext value="#047857">
        <Modal isOpen onClose={() => undefined} title="VA" accent="#b91c1c">
          body
        </Modal>
      </WidgetAccentContext>
    );
    expect(dialog().style.getPropertyValue('--brand-blue-primary')).toBe(
      '#b91c1c'
    );
  });
});

describe('widgetDialogAccent', () => {
  it('needs the preview flag and a library color', () => {
    expect(widgetDialogAccent('flashcards', () => true)).toBe('#be185d');
    expect(widgetDialogAccent('flashcards', () => false)).toBeUndefined();
    expect(widgetDialogAccent('clock', () => true)).toBeUndefined();
  });
});

describe('WidgetAccentScope', () => {
  it('adds no wrapper outside a widget and themes inside one', async () => {
    const { WidgetAccentScope } =
      await import('@/components/common/WidgetAccentScope');
    const { container, rerender } = render(
      <WidgetAccentScope>
        <span>menu</span>
      </WidgetAccentScope>
    );
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    rerender(
      <WidgetAccentContext value="#c2410c">
        <WidgetAccentScope>
          <span>menu</span>
        </WidgetAccentScope>
      </WidgetAccentContext>
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toBe('contents');
    expect(wrap.style.getPropertyValue('--brand-blue-primary')).toBe('#c2410c');
  });
});
