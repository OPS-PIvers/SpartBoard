import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WidgetData, WidgetType } from '@/types';
import type { FieldCtx } from '@/components/settings/schema/types';
import { FieldRenderer } from '@/components/settings/renderer/FieldRenderer';
import { useDashboard } from '@/context/useDashboard';
import en from '@/locales/en.json';
import schema, { previewTimerSound } from './settings.schema';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/utils/timeToolAudio', () => ({
  playTimerAlert: vi.fn(),
  resumeAudio: vi.fn().mockResolvedValue(undefined),
}));

const mockedUseDashboard = vi.mocked(useDashboard);
const leaves = (
  en as unknown as { widgetSettings: Record<string, Record<string, string>> }
).widgetSettings['time-tool'];

const t = (key: string, options?: Record<string, unknown>): string => {
  const leaf = key.replace(/^widgetSettings\.time-tool\./, '');
  if (leaf in leaves) return leaves[leaf];
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
};

const widget = {
  id: 'tt-1',
  type: 'time-tool' as WidgetType,
  x: 0,
  y: 0,
  w: 420,
  h: 400,
  z: 1,
  config: {},
} as WidgetData;

const makeCtx = (config: Record<string, unknown>): FieldCtx => ({
  config,
  widget: { ...widget, config } as WidgetData,
  isAdmin: false,
  canAccessFeature: () => true,
  t,
});

const fieldByKey = (key: string) => {
  const field = schema.groups
    .flatMap((g) => g.fields)
    .find((f) => f.key === key);
  if (!field) throw new Error(`no field ${key}`);
  return field;
};

const renderKey = (key: string, config: Record<string, unknown>) => {
  const updateConfig = vi.fn();
  render(
    <FieldRenderer
      field={fieldByKey(key)}
      widget={widget}
      ctx={makeCtx(config)}
      updateConfig={updateConfig}
    />
  );
  return updateConfig;
};

const addWidget = vi.fn();
const boardWith = (...types: WidgetType[]) =>
  mockedUseDashboard.mockReturnValue({
    activeDashboard: { widgets: types.map((type) => ({ type })) },
    addWidget,
  } as unknown as ReturnType<typeof useDashboard>);

beforeEach(() => {
  vi.clearAllMocks();
  boardWith();
});

describe('mode field', () => {
  it('resets the runtime keys when switching to stopwatch', () => {
    const updateConfig = renderKey('mode', {
      mode: 'timer',
      duration: 45,
      elapsedTime: 30,
      isRunning: true,
      startTime: 123,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Stopwatch' }));
    expect(updateConfig).toHaveBeenCalledWith({
      mode: 'stopwatch',
      elapsedTime: 0,
      isRunning: false,
      startTime: null,
    });
  });

  it('restores the 10-minute default when switching back to timer', () => {
    const updateConfig = renderKey('mode', { mode: 'stopwatch' });
    fireEvent.click(screen.getByRole('radio', { name: 'Timer' }));
    expect(updateConfig).toHaveBeenCalledWith({
      mode: 'timer',
      duration: 600,
      elapsedTime: 600,
      isRunning: false,
      startTime: null,
    });
  });

  it('does not re-run the reset when arrowing back to the active mode', () => {
    const updateConfig = renderKey('mode', { mode: 'timer', isRunning: true });
    const timer = screen.getByRole('radio', { name: 'Timer' });
    timer.focus();
    fireEvent.keyDown(timer, { key: 'ArrowRight' });
    expect(updateConfig).toHaveBeenCalledTimes(1);
    updateConfig.mockClear();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Stopwatch' }), {
      key: 'ArrowLeft',
    });
    expect(updateConfig).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radiogroup', { name: 'Mode' })
    ).toBeInTheDocument();
  });
});

describe('nullable timer-end fields', () => {
  it('writes null for "None" and a number for a voice level', () => {
    boardWith('expectations');
    const updateConfig = renderKey('timerEndVoiceLevel', {
      timerEndVoiceLevel: 2,
    });
    expect(screen.getByRole('radio', { name: 'Lvl 2' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(updateConfig).toHaveBeenCalledWith({ timerEndVoiceLevel: null });
    fireEvent.click(screen.getByRole('radio', { name: 'Lvl 4' }));
    expect(updateConfig).toHaveBeenCalledWith({ timerEndVoiceLevel: 4 });
  });

  it('disables the voice level control inside its partner card when Expectations is absent', () => {
    renderKey('timerEndVoiceLevel', { timerEndVoiceLevel: 2 });
    expect(screen.getByRole('radio', { name: 'Lvl 2' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(addWidget).toHaveBeenCalledWith('expectations');
  });

  it('treats an absent traffic color as "None" and writes color names', () => {
    boardWith('traffic');
    const updateConfig = renderKey('timerEndTrafficColor', {});
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Slow' }));
    expect(updateConfig).toHaveBeenCalledWith({
      timerEndTrafficColor: 'yellow',
    });
  });

  it('disables the traffic color control inside its partner card when Traffic Light is absent', () => {
    renderKey('timerEndTrafficColor', {});
    expect(screen.getByRole('radio', { name: 'Slow' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(addWidget).toHaveBeenCalledWith('traffic');
  });
});

describe('segmented option labels', () => {
  it('resolves visualType and clockStyle option leaves to English text', () => {
    renderKey('visualType', { visualType: 'digital' });
    expect(screen.getByRole('radio', { name: 'Digital' })).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Visual Ring' })
    ).toBeInTheDocument();
  });

  it('resolves clockStyle option leaves to English text', () => {
    renderKey('clockStyle', { clockStyle: 'modern' });
    expect(screen.getByRole('radio', { name: 'Default' })).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'LCD Panel' })
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Minimal' })).toBeInTheDocument();
  });
});

describe('sound preview', () => {
  it('resumes the shared context, then plays the picked sound', async () => {
    const audio = await import('@/utils/timeToolAudio');
    previewTimerSound('Blip');
    await Promise.resolve();
    expect(audio.resumeAudio).toHaveBeenCalled();
    expect(audio.playTimerAlert).toHaveBeenCalledWith('Blip');
  });
});
