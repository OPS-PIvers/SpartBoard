import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WidgetLayoutWrapper } from '@/components/widgets/WidgetLayout/WidgetLayoutWrapper';
import { WidgetData } from '@/types';
import * as WidgetRegistry from '@/components/widgets/WidgetRegistry';

// Spy on WIDGET_COMPONENTS registry to inject our mock
vi.mock('@/components/widgets/WidgetRegistry', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/widgets/WidgetRegistry')
  >('@/components/widgets/WidgetRegistry');

  const MockValidWidgetComponent = vi.fn(
    ({
      widget,
      scale,
      isStudentView,
      studentPin,
      isSpotlighted,
    }: import('@/types').WidgetComponentProps) => (
      <div data-testid="valid-widget">
        Valid Widget: {widget.id}
        Props passed:{' '}
        {JSON.stringify({
          w: widget.w,
          h: widget.h,
          scale,
          isStudentView,
          studentPin,
          isSpotlighted,
        })}
      </div>
    )
  );

  return {
    ...actual,
    WIDGET_COMPONENTS: {
      text: MockValidWidgetComponent,
    },
  };
});

// A component simulating an asynchronous/lazy load to test Suspense
const MockLazyWidgetComponent = React.lazy(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Promise<{ default: React.FC<any> }>((resolve) => {
    setTimeout(() => {
      resolve({
        default: () => <div data-testid="lazy-widget">Lazy Widget Content</div>,
      });
    }, 100);
  });
});

describe('WidgetLayoutWrapper', () => {
  const defaultWidgetProps = {
    id: 'widget-123',
    type: 'text' as const,
    x: 0,
    y: 0,
    w: 2,
    h: 2,
  } as WidgetData;

  it('renders "Widget under construction" message for unknown widget types', () => {
    const unknownWidget = {
      ...defaultWidgetProps,
      type: 'unknown-type' as unknown as WidgetData['type'],
    };

    render(
      <WidgetLayoutWrapper
        widget={unknownWidget}
        w={unknownWidget.w}
        h={unknownWidget.h}
      />
    );

    expect(screen.getByText('Widget under construction')).toBeInTheDocument();
  });

  it('renders the correct widget component from registry', () => {
    render(
      <WidgetLayoutWrapper
        widget={defaultWidgetProps}
        w={defaultWidgetProps.w}
        h={defaultWidgetProps.h}
      />
    );

    expect(screen.getByTestId('valid-widget')).toBeInTheDocument();
    expect(screen.getByText(/Valid Widget: widget-123/)).toBeInTheDocument();
  });

  it('passes proper props down to the widget component', () => {
    render(
      <WidgetLayoutWrapper
        widget={defaultWidgetProps}
        w={4} // overridden size via props
        h={4}
        scale={1.5}
        isStudentView={true}
        studentPin="1234"
        isSpotlighted={true}
      />
    );

    const validWidgetNode = screen.getByTestId('valid-widget');
    expect(validWidgetNode).toBeInTheDocument();
    expect(validWidgetNode).toHaveTextContent('w":4');
    expect(validWidgetNode).toHaveTextContent('h":4');
    expect(validWidgetNode).toHaveTextContent('scale":1.5');
    expect(validWidgetNode).toHaveTextContent('isStudentView":true');
    expect(validWidgetNode).toHaveTextContent('studentPin":"1234"');
    expect(validWidgetNode).toHaveTextContent('isSpotlighted":true');
  });

  it('displays the loading fallback while a widget is lazily loading', async () => {
    // Inject our lazy component into the registry temporarily for this test
    vi.spyOn(WidgetRegistry, 'WIDGET_COMPONENTS', 'get').mockReturnValue({
      text: MockLazyWidgetComponent as unknown as React.FC<
        import('@/types').WidgetComponentProps
      >,
    });

    const lazyWidget = { ...defaultWidgetProps, type: 'text' as const };

    render(
      <WidgetLayoutWrapper
        widget={lazyWidget}
        w={lazyWidget.w}
        h={lazyWidget.h}
      />
    );

    // Initial render should show the spinny fallback (identified by its classes as it lacks a simple text)
    // We can query the element with 'animate-spin'
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();

    // After resolution, it should show the content
    await waitFor(() => {
      expect(screen.getByTestId('lazy-widget')).toBeInTheDocument();
    });
  });
});
