// Pins the manual-temperature slider's label association; dropping htmlFor/id leaves it unnamed with nothing else failing.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: vi.fn(), addToast: vi.fn() }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ featurePermissions: [] }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/common/TypographySettings', () => ({
  TypographySettings: () => null,
}));

import { WeatherSettings } from './Settings';

const widget: WidgetData = {
  id: 'weather-test-1',
  type: 'weather',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: true,
  config: { isAuto: false, temperature: 70 },
};

describe('WeatherSettings — label associations', () => {
  it('names the manual temperature slider from its label', () => {
    render(<WeatherSettings widget={widget} />);

    expect(
      screen.getByLabelText(/widgets\.weather\.temperature/)
    ).toHaveAttribute('type', 'range');
  });
});
