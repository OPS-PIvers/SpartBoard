import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

describe('EditorWorkspace', () => {
  const baseProps = {
    isOpen: true,
    title: 'Test workspace',
    isDirty: false,
    onSave: vi.fn(),
    onClose: vi.fn(),
    contextPane: <div data-testid="ctx">context content</div>,
    detailPane: <div data-testid="detail">detail content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both panes when open', () => {
    render(<EditorWorkspace {...baseProps} />);
    expect(screen.getByTestId('ctx')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    expect(screen.getByText('Test workspace')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <EditorWorkspace {...baseProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('ctx')).not.toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  it('passes contextRatio through to the grid template', () => {
    render(<EditorWorkspace {...baseProps} contextRatio={70} />);
    const ctx = screen.getByTestId('ctx');
    const grid = ctx.parentElement?.parentElement;
    expect(grid).not.toBeNull();
    expect(grid?.style.gridTemplateColumns).toContain('70fr');
    expect(grid?.style.gridTemplateColumns).toContain('30fr');
  });

  it('clamps contextRatio into 1..99 range', () => {
    const { rerender } = render(
      <EditorWorkspace {...baseProps} contextRatio={0} />
    );
    let grid = screen.getByTestId('ctx').parentElement?.parentElement;
    expect(grid?.style.gridTemplateColumns).toContain('1fr');
    expect(grid?.style.gridTemplateColumns).toContain('99fr');

    rerender(<EditorWorkspace {...baseProps} contextRatio={150} />);
    grid = screen.getByTestId('ctx').parentElement?.parentElement;
    expect(grid?.style.gridTemplateColumns).toContain('99fr');
    expect(grid?.style.gridTemplateColumns).toContain('1fr');
  });

  it('uses 56/44 split by default', () => {
    render(<EditorWorkspace {...baseProps} />);
    const grid = screen.getByTestId('ctx').parentElement?.parentElement;
    expect(grid?.style.gridTemplateColumns).toContain('56fr');
    expect(grid?.style.gridTemplateColumns).toContain('44fr');
  });

  it('renders Cancel and Save buttons from the shell', () => {
    render(<EditorWorkspace {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
