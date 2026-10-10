import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalFeaturePermission } from '@/types';

const updatePermission = vi.fn();
let config: Record<string, unknown> = {};

vi.mock('./useGlobalPermissionsEditor', () => ({
  useGlobalPermissionsEditor: () => ({
    loading: false,
    getPermission: (): GlobalFeaturePermission => ({
      featureId: 'gemini-functions',
      accessLevel: 'public',
      betaUsers: [],
      enabled: true,
      config,
    }),
    updatePermission,
    savePermission: vi.fn(),
    unsavedChanges: new Set<string>(),
    saving: new Set<string>(),
  }),
}));

vi.mock('./useAiUsageLog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useAiUsageLog')>();
  return {
    ...actual,
    useAiUsageLog: () => ({
      claudeConfigured: false,
      usage: {
        quiz: {
          calls: 12,
          inputTokens: 1000,
          outputTokens: 500,
          fallbacks: 2,
          errors: 0,
          byModel: { 'claude-sonnet-5-5': 12 },
          tokensByModel: {
            'claude-sonnet-5-5': { input: 1_000_000, output: 100_000 },
          },
        },
      },
    }),
  };
});

import { AiModelsPanel } from './AiModelsPanel';
import { claudeCost } from './useAiUsageLog';

const modelSelect = (label: string) =>
  screen.getByRole('combobox', { name: `Model for ${label}` });

describe('AiModelsPanel', () => {
  beforeEach(() => {
    updatePermission.mockReset();
    config = {
      allowedModels: ['gemini-3.8-flash', 'claude-sonnet-5-5'],
      integrationModels: { quiz: 'claude-sonnet-5-5' },
    };
  });

  it('lists every AI feature with its model and usage', () => {
    render(<AiModelsPanel />);
    expect(modelSelect('Quiz generation')).toHaveValue('claude-sonnet-5-5');
    expect(screen.getByText(/12 calls/)).toBeInTheDocument();
    expect(screen.getByText(/2 fell back/)).toBeInTheDocument();
    expect(
      screen.getByText('Claude API key not set, Gemini runs instead')
    ).toBeInTheDocument();
  });

  it('offers Claude only where it can read the input', () => {
    render(<AiModelsPanel />);
    const video = within(modelSelect('Video activity questions'));
    expect(
      video.queryByRole('option', { name: 'Claude Sonnet 5.5' })
    ).toBeNull();
    const notes = within(modelSelect('PLC meeting notes'));
    expect(
      notes.getByRole('option', { name: 'Claude Sonnet 5.5' })
    ).toBeInTheDocument();
  });

  it('saves a per-feature choice and clears it back to the default', () => {
    render(<AiModelsPanel />);
    fireEvent.change(modelSelect('PLC meeting notes'), {
      target: { value: 'claude-sonnet-5-5' },
    });
    expect(updatePermission).toHaveBeenLastCalledWith('gemini-functions', {
      config: expect.objectContaining({
        integrationModels: {
          quiz: 'claude-sonnet-5-5',
          'plc-meeting-summary': 'claude-sonnet-5-5',
        },
      }) as unknown,
    });
    fireEvent.change(modelSelect('Quiz generation'), {
      target: { value: '' },
    });
    expect(updatePermission).toHaveBeenLastCalledWith('gemini-functions', {
      config: expect.objectContaining({ integrationModels: {} }) as unknown,
    });
  });

  it('drops a model from every feature when it is no longer allowed', () => {
    render(<AiModelsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Allowed models' }));
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: /Claude Sonnet 5\.5/ })
    );
    expect(updatePermission).toHaveBeenLastCalledWith('gemini-functions', {
      config: expect.objectContaining({
        allowedModels: ['gemini-3.8-flash'],
        integrationModels: {},
      }) as unknown,
    });
  });
});

describe('claudeCost', () => {
  it('prices Claude tokens and ignores Gemini', () => {
    expect(
      claudeCost({
        calls: 2,
        inputTokens: 0,
        outputTokens: 0,
        fallbacks: 0,
        errors: 0,
        byModel: {},
        tokensByModel: {
          'claude-sonnet-5-5': { input: 1_000_000, output: 100_000 },
          'gemini-3.8-flash': { input: 5_000_000, output: 5_000_000 },
        },
      })
    ).toBeCloseTo(3);
  });
});
