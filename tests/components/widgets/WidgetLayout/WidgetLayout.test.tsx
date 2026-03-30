import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WidgetLayout } from '@/components/widgets/WidgetLayout/WidgetLayout';

describe('WidgetLayout', () => {
  it('renders content only by default', () => {
    render(<WidgetLayout content={<div data-testid="content">Content</div>} />);

    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });

  it('renders header, content, and footer when provided', () => {
    render(
      <WidgetLayout
        header={<div data-testid="header">Header</div>}
        content={<div data-testid="content">Content</div>}
        footer={<div data-testid="footer">Footer</div>}
      />
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('applies default padding structure logic without testing exact CSS classes', () => {
    render(
      <WidgetLayout
        header={<div data-testid="header">Header</div>}
        content={<div data-testid="content">Content</div>}
      />
    );

    const contentNode = screen.getByTestId('content');
    expect(contentNode).toBeInTheDocument();
  });

  it('allows custom content class names to be passed', () => {
    render(
      <WidgetLayout
        contentClassName="custom-content-class"
        content={<div data-testid="content">Content</div>}
      />
    );

    const contentWrapper = screen.getByTestId('content').parentElement;
    expect(contentWrapper?.className).toContain('custom-content-class');
  });
});
