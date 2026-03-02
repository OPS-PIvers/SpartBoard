import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizImporter } from './QuizImporter';
import { generateQuiz } from '../../../utils/ai';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock generateQuiz
vi.mock('../../../utils/ai', () => ({
  generateQuiz: vi.fn(),
}));

describe('QuizImporter', () => {
  const mockOnBack = vi.fn();
  const mockOnSave = vi.fn();
  const mockImportFromSheet = vi.fn();
  const mockImportFromCSV = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Generate with AI" button', () => {
    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    expect(screen.getByText('Generate with AI')).toBeInTheDocument();
  });

  it('opens and closes the AI generation overlay', () => {
    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    // Click "Generate with AI"
    const generateButton = screen.getByText('Generate with AI');
    fireEvent.click(generateButton);

    // Check if overlay is open
    expect(
      screen.getByText('Describe the quiz you want to create.')
    ).toBeInTheDocument();

    // Click Close button (X icon)
    const closeButton = screen.getByLabelText('Close Magic Generator');
    fireEvent.click(closeButton);

    // Check if overlay is closed
    expect(
      screen.queryByText('Describe the quiz you want to create.')
    ).not.toBeInTheDocument();
  });

  it('closes the AI generation overlay when Escape key is pressed', async () => {
    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    // Open overlay
    fireEvent.click(screen.getByText('Generate with AI'));

    // Verify overlay is open
    expect(
      screen.getByText('Describe the quiz you want to create.')
    ).toBeInTheDocument();

    // The overlay should be focused due to our fix in the component.
    // However, in JSDOM, we might need to manually ensure the focus or fire on the window.
    // The component attaches onKeyDown to the DIV.

    // Find the overlay container (the div with the event handler)
    // We can find it by finding the close button and going up to the overlay container
    const closeButton = screen.getByLabelText('Close Magic Generator');
    // The structure is: div (overlay) -> div (content) -> div (header) -> button (close)
    const overlayContent = closeButton.closest('div')?.parentElement;
    const overlayContainer = overlayContent?.parentElement;

    if (overlayContainer) {
      // Ensure it's focused as per the component logic
      overlayContainer.focus();
      fireEvent.keyDown(overlayContainer, { key: 'Escape', code: 'Escape' });
    } else {
      // Fallback: Fire on active element
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
        code: 'Escape',
      });
    }

    // Verify overlay is closed
    await waitFor(() => {
      expect(
        screen.queryByText('Describe the quiz you want to create.')
      ).not.toBeInTheDocument();
    });
  });

  it('handles successful quiz generation with fallback defaults', async () => {
    // Missing timeLimit (should default to 30) and type (should default to MC)
    const mockQuizData = {
      title: 'Solar System Quiz',
      questions: [
        {
          text: 'Which planet is closest to the sun?',
          correctAnswer: 'Mercury',
          incorrectAnswers: ['Venus', 'Earth', 'Mars'],
          // missing timeLimit
          // missing type
        },
      ],
    };

    vi.mocked(generateQuiz).mockResolvedValue(
      mockQuizData as unknown as import('../../../utils/ai').GeneratedQuiz
    );

    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    // Open overlay
    fireEvent.click(screen.getByText('Generate with AI'));

    // Type prompt
    const promptInput = screen.getByPlaceholderText(/e.g. A 5-question quiz/i);
    fireEvent.change(promptInput, { target: { value: 'Solar system quiz' } });

    // Click Generate
    const generateButton = screen.getByRole('button', {
      name: /generate quiz/i,
    });
    fireEvent.click(generateButton);

    // Wait for async generation
    await waitFor(() => {
      expect(generateQuiz).toHaveBeenCalledWith('Solar system quiz');
    });

    // Check if title is populated
    await waitFor(() => {
      expect(screen.getByDisplayValue('Solar System Quiz')).toBeInTheDocument();
    });

    // Verify question text
    expect(
      screen.getByText('Which planet is closest to the sun?')
    ).toBeInTheDocument();

    // Verify defaults were applied:
    // "MC" badge should be present
    expect(screen.getByText('MC')).toBeInTheDocument();
    // "30s" badge should be present (default timeLimit)
    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });

  it('validates question types and falls back to MC for invalid types', async () => {
    const mockQuizData = {
      title: 'Invalid Type Quiz',
      questions: [
        {
          text: 'What is a closure?',
          type: 'INVALID_TYPE', // Should fallback to MC
          correctAnswer: 'A function bundled with its lexical environment',
          incorrectAnswers: [],
        },
      ],
    };

    vi.mocked(generateQuiz).mockResolvedValue(
      mockQuizData as unknown as import('../../../utils/ai').GeneratedQuiz
    );

    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    fireEvent.click(screen.getByText('Generate with AI'));

    const promptInput = screen.getByPlaceholderText(/e.g. A 5-question quiz/i);
    fireEvent.change(promptInput, { target: { value: 'Coding quiz' } });

    const generateButton = screen.getByRole('button', {
      name: /generate quiz/i,
    });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Invalid Type Quiz')).toBeInTheDocument();
    });

    // Verify it defaulted to MC
    expect(screen.getByText('MC')).toBeInTheDocument();
  });

  it('handles generation error', async () => {
    vi.mocked(generateQuiz).mockRejectedValue(new Error('API Error'));

    render(
      <QuizImporter
        onBack={mockOnBack}
        onSave={mockOnSave}
        importFromSheet={mockImportFromSheet}
        importFromCSV={mockImportFromCSV}
      />
    );

    // Open overlay
    fireEvent.click(screen.getByText('Generate with AI'));

    // Type prompt
    const promptInput = screen.getByPlaceholderText(/e.g. A 5-question quiz/i);
    fireEvent.change(promptInput, { target: { value: 'Bad prompt' } });

    // Click Generate
    const generateButton = screen.getByRole('button', {
      name: /generate quiz/i,
    });
    fireEvent.click(generateButton);

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });
});
