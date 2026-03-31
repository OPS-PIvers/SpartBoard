import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetLayoutWrapper } from '@/components/widgets/WidgetLayout/WidgetLayoutWrapper';
import { WidgetData, WidgetComponentProps } from '@/types';

// Mock the entire WidgetRegistry to control WIDGET_COMPONENTS and simulate different types
vi.mock('@/components/widgets/WidgetRegistry', () => {
  return {
    WIDGET_COMPONENTS: {
      text: (props: WidgetComponentProps) => (
        <div data-testid="text-widget">
          Text Widget Data: {props.widget.id}
          <br />
          Props W: {props.widget.w}
          <br />
          Props H: {props.widget.h}
          <br />
          Scale: {props.scale}
          <br />
          Is Student View: {props.isStudentView ? 'true' : 'false'}
          <br />
          Student Pin: {props.studentPin}
          <br />
          Is Spotlighted: {props.isSpotlighted ? 'true' : 'false'}
        </div>
      ),
    },
  };
});

describe('WidgetLayoutWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseWidget: WidgetData = {
    id: 'test-id',
    type: 'text', // This corresponds to the mocked text component
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    z: 1,
    flipped: false,
    minimized: false,
    maximized: false,
    transparency: 1,
    config: {},
  };

  it('renders a registered widget component', async () => {
    render(
      <React.Suspense fallback={<div>Loading...</div>}>
        <WidgetLayoutWrapper widget={baseWidget} w={300} h={150} scale={1.5} />
      </React.Suspense>
    );

    // It should render the mocked "text" widget
    const widgetEl = await screen.findByTestId('text-widget');
    expect(widgetEl).toBeInTheDocument();
  });

  it('passes props correctly to the widget component', async () => {
    render(
      <React.Suspense fallback={<div>Loading...</div>}>
        <WidgetLayoutWrapper
          widget={baseWidget}
          w={350}
          h={175}
          scale={2}
          isStudentView={true}
          studentPin="1234"
          isSpotlighted={true}
        />
      </React.Suspense>
    );

    const widgetEl = await screen.findByTestId('text-widget');
    expect(widgetEl).toBeInTheDocument();

    // Verify props are correctly passed
    expect(widgetEl).toHaveTextContent('Text Widget Data: test-id');
    expect(widgetEl).toHaveTextContent('Props W: 350');
    expect(widgetEl).toHaveTextContent('Props H: 175');
    expect(widgetEl).toHaveTextContent('Scale: 2');
    expect(widgetEl).toHaveTextContent('Is Student View: true');
    expect(widgetEl).toHaveTextContent('Student Pin: 1234');
    expect(widgetEl).toHaveTextContent('Is Spotlighted: true');
  });

  it('renders fallback for unregistered widget component', () => {
    const unknownWidget: WidgetData = {
      ...baseWidget,
      type: 'clock',
    };

    render(<WidgetLayoutWrapper widget={unknownWidget} w={300} h={150} />);

    // It should render the fallback message
    expect(screen.getByText('Widget under construction')).toBeInTheDocument();
  });
});
