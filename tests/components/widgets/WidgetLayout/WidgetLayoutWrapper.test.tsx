import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetLayoutWrapper } from '@/components/widgets/WidgetLayout/WidgetLayoutWrapper';

// Mock the registry
vi.mock('@/components/widgets/WidgetRegistry', () => ({
  WIDGET_COMPONENTS: {
    text: () => <div data-testid="mock-text-widget">Text Widget</div>,
  },
}));

describe('WidgetLayoutWrapper', () => {
  it('renders a registered widget component', async () => {
    render(
      <WidgetLayoutWrapper
        widget={{
          id: 'test-1',
          type: 'text',
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          isLocked: false,
          flipped: false,
          config: {},
          z: 1,
        }}
        w={200}
        h={200}
      />
    );
    expect(await screen.findByTestId('mock-text-widget')).toBeInTheDocument();
  });

  it('renders a fallback message for an unregistered widget type', () => {
    render(
      <WidgetLayoutWrapper
        widget={{
          id: 'test-2',
          type: 'clock', // Intentional missing type in the mock registry
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          isLocked: false,
          flipped: false,
          config: {},
          z: 1,
        }}
        w={200}
        h={200}
      />
    );
    expect(screen.getByText('Widget under construction')).toBeInTheDocument();
  });
});
