import { describe, it, expect } from 'vitest';
import {
  mergeWidgetConfig,
  stripTransientKeys,
} from '@/utils/widgetConfigPersistence';
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

  it('strips text widget content so new instances start blank while styling carries over', () => {
    const config = {
      content: 'notes from the previous instance',
      bgColor: '#60a5fa',
      fontSize: 18,
      fontFamily: 'handwritten',
      fontColor: '#ffffff',
      textSizePreset: 'large',
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({
      bgColor: '#60a5fa',
      fontSize: 18,
      fontFamily: 'handwritten',
      fontColor: '#ffffff',
      textSizePreset: 'large',
    });
    expect(result).not.toHaveProperty('content');
  });

  it('strips PII fields so student data never reaches Firestore', () => {
    const config = {
      firstNames: 'Alice\nBob',
      lastNames: 'Smith\nJones',
      names: ['Alice', 'Bob'],
      roster: [{ name: 'Alice' }],
      completedNames: ['Alice'],
      remainingStudents: ['Bob'],
      fontFamily: 'sans',
      cardColor: '#fff',
    } as Partial<WidgetConfig>;

    const result = stripTransientKeys(config);

    expect(result).toEqual({ fontFamily: 'sans', cardColor: '#fff' });
    expect(result).not.toHaveProperty('firstNames');
    expect(result).not.toHaveProperty('lastNames');
    expect(result).not.toHaveProperty('names');
    expect(result).not.toHaveProperty('roster');
    expect(result).not.toHaveProperty('completedNames');
    expect(result).not.toHaveProperty('remainingStudents');
  });
});

describe('mergeWidgetConfig', () => {
  it('layers defaults < admin < saved < overrides (later wins)', () => {
    const defaults = {
      fontFamily: 'sans',
      fontColor: '#000',
      cardOpacity: 0.5,
    } as Partial<WidgetConfig>;
    const adminConfig = { fontColor: '#111', cardColor: '#fff' } as Record<
      string,
      unknown
    >;
    const saved = { cardOpacity: 0.8 } as Partial<WidgetConfig>;
    const overrides = { fontColor: '#222' } as Partial<WidgetConfig>;

    const result = mergeWidgetConfig(defaults, adminConfig, saved, overrides);

    expect(result).toEqual({
      fontFamily: 'sans',
      fontColor: '#222',
      cardColor: '#fff',
      cardOpacity: 0.8,
    });
  });

  it('strips transient keys from the saved layer only', () => {
    const defaults = { isRunning: true } as Partial<WidgetConfig>;
    const saved = {
      isRunning: false,
      content: 'leftover',
      fontFamily: 'mono',
    } as Partial<WidgetConfig>;
    const overrides = { content: 'fresh' } as Partial<WidgetConfig>;

    const result = mergeWidgetConfig(defaults, undefined, saved, overrides);

    expect(result).toEqual({
      isRunning: true,
      fontFamily: 'mono',
      content: 'fresh',
    });
  });

  it('treats undefined layers as empty', () => {
    const result = mergeWidgetConfig(
      undefined,
      undefined,
      undefined,
      undefined
    );
    expect(result).toEqual({});
  });
});
