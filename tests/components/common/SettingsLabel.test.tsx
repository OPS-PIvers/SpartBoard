import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Bell } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { SettingsLabelToneProvider } from '@/components/common/SettingsLabelToneContext';

describe('SettingsLabel tone', () => {
  it('matches default render snapshot (label variant)', () => {
    const { container } = render(
      <SettingsLabel htmlFor="foo">Label Text</SettingsLabel>
    );
    expect(container).toMatchSnapshot();
  });

  it('matches default render snapshot (span variant with icon)', () => {
    const { container } = render(
      <SettingsLabel as="span" icon={Bell} id="bar">
        Group Heading
      </SettingsLabel>
    );
    expect(container).toMatchSnapshot();
  });

  it('drawer tone swaps only the color class on label variant', () => {
    const { container: defaultContainer } = render(
      <SettingsLabel htmlFor="foo">Label Text</SettingsLabel>
    );
    const { container: drawerContainer } = render(
      <SettingsLabel htmlFor="foo" tone="drawer">
        Label Text
      </SettingsLabel>
    );
    const defaultClass =
      defaultContainer.querySelector('label')?.className ?? '';
    const drawerClass = drawerContainer.querySelector('label')?.className ?? '';
    expect(defaultClass).toContain('text-slate-400');
    expect(drawerClass).toContain('text-slate-700');
    expect(drawerClass.replace('text-slate-700', 'text-slate-400')).toBe(
      defaultClass
    );
  });

  it('resolves tone from SettingsLabelToneContext when prop is omitted', () => {
    const { container } = render(
      <SettingsLabelToneProvider value="drawer">
        <SettingsLabel htmlFor="foo">Label Text</SettingsLabel>
      </SettingsLabelToneProvider>
    );
    expect(container.querySelector('label')?.className).toContain(
      'text-slate-700'
    );
  });

  it('prop tone overrides context tone', () => {
    const { container } = render(
      <SettingsLabelToneProvider value="drawer">
        <SettingsLabel htmlFor="foo" tone="default">
          Label Text
        </SettingsLabel>
      </SettingsLabelToneProvider>
    );
    expect(container.querySelector('label')?.className).toContain(
      'text-slate-400'
    );
  });
});
