import { describe, it, expect } from 'vitest';
import { stripTransientKeys } from '@/utils/widgetConfigPersistence';
import type { WidgetConfig } from '@/types';

describe('stripTransientKeys', () => {
  it('removes transient runtime state keys', () => {
    const config = {
      isRunning: true,
      elapsedTime: 42,
      startTime: Date.now(),
      duration: 300,
      selectedSound: 'Chime',
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({ duration: 300, selectedSound: 'Chime' });
    expect(result).not.toHaveProperty('isRunning');
    expect(result).not.toHaveProperty('elapsedTime');
    expect(result).not.toHaveProperty('startTime');
  });

  it('removes large instance data keys', () => {
    const config = {
      paths: [{ points: [] }],
      color: '#ff0000',
      width: 3,
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({ color: '#ff0000', width: 3 });
    expect(result).not.toHaveProperty('paths');
  });

  it('removes navigation view state', () => {
    const config = {
      view: 'manager',
      selectedQuizId: 'quiz-123',
      plcMode: true,
      teacherName: 'Ms. Smith',
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({ plcMode: true, teacherName: 'Ms. Smith' });
  });

  it('retains all keys when none are transient', () => {
    const config = {
      fontFamily: 'sans',
      fontColor: '#000',
      cardColor: '#fff',
      cardOpacity: 0.8,
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual(config);
  });

  it('returns empty object when all keys are transient', () => {
    const config = {
      isRunning: true,
      elapsedTime: 10,
      view: 'editor',
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({});
  });

  it('does not mutate the input config', () => {
    const config = {
      isRunning: true,
      duration: 60,
    } as Partial<WidgetConfig>;

    const original = { ...config };
    stripTransientKeys(config);

    expect(config).toEqual(original);
  });
});
