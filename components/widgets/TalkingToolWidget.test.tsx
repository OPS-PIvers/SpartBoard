import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TalkingToolWidget } from './TalkingToolWidget';
import { WidgetData } from '@/types';

const mockWidget: WidgetData = {
  id: 'test-widget',
  type: 'talking-tool',
  x: 0,
  y: 0,
  w: 500,
  h: 450,
  z: 1,
  flipped: false,
  config: {},
};

describe('TalkingToolWidget', () => {
  it('renders correctly and defaults to "Listen Closely" tab', () => {
    render(<TalkingToolWidget widget={mockWidget} />);

    // Check if the title "Listen Closely" is visible in the main content
    expect(
      screen.getByText('Listen Closely', { selector: 'h3' })
    ).toBeInTheDocument();

    // Check if a specific stem from "Listen Closely" is visible
    expect(screen.getByText(/What do you mean by/)).toBeInTheDocument();
  });

  it('switches tabs when a sidebar button is clicked', () => {
    render(<TalkingToolWidget widget={mockWidget} />);

    // Find and click the "Share What You Think" button in the sidebar
    const shareButton = screen.getByText('Share What You Think');
    fireEvent.click(shareButton);

    // Check if the title "Share What You Think" is now visible in the main content
    expect(
      screen.getByText('Share What You Think', { selector: 'h3' })
    ).toBeInTheDocument();

    // Check if a specific stem from "Share What You Think" is visible
    expect(
      screen.getByText(/I think ________ because ________./)
    ).toBeInTheDocument();

    // Find and click the "Support What You Say" button in the sidebar
    const supportButton = screen.getByText('Support What You Say');
    fireEvent.click(supportButton);

    // Check if the title "Support What You Say" is visible
    expect(
      screen.getByText('Support What You Say', { selector: 'h3' })
    ).toBeInTheDocument();

    // Check if a specific stem from "Support What You Say" is visible
    expect(screen.getByText(/In the text, ________./)).toBeInTheDocument();
  });
});
