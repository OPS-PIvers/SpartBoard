import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchoologyExportGuide } from '@/components/common/library/importer/SchoologyExportGuide';
import type { ExtensionStatus } from '@/components/tours/web/extensionClient';

const ping = vi.fn<() => Promise<ExtensionStatus>>();

vi.mock('@/components/tours/web/extensionClient', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/components/tours/web/extensionClient')
  >()),
  pingExtension: () => ping(),
}));

describe('SchoologyExportGuide', () => {
  beforeEach(() => {
    ping.mockReset();
    ping.mockResolvedValue({ kind: 'none' });
  });

  it('shows both export routes for quizzes once opened', () => {
    render(<SchoologyExportGuide kind="quizzes" canSend />);
    expect(screen.queryByText('From a course')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /How to export from Schoology/ })
    );
    expect(screen.getByText('From a course')).toBeInTheDocument();
    expect(screen.getByText('From Resources')).toBeInTheDocument();
  });

  it('shows only the Resources route for question banks', () => {
    render(<SchoologyExportGuide kind="banks" canSend />);
    fireEvent.click(
      screen.getByRole('button', { name: /How to export from Schoology/ })
    );
    expect(screen.queryByText('From a course')).not.toBeInTheDocument();
    expect(screen.getByText('From Resources')).toBeInTheDocument();
  });

  it('points to the Send button when the staff extension is installed', async () => {
    ping.mockResolvedValue({
      kind: 'ready',
      profile: 'staff',
      protocol: 99,
      version: '0.1.22',
    });
    render(<SchoologyExportGuide kind="banks" canSend />);
    await waitFor(() =>
      expect(screen.getByText('Send to SpartBoard')).toBeInTheDocument()
    );
  });

  it('says nothing about the Send button without the extension', async () => {
    render(<SchoologyExportGuide kind="quizzes" canSend />);
    await waitFor(() => expect(ping).toHaveBeenCalled());
    expect(screen.queryByText('Send to SpartBoard')).not.toBeInTheDocument();
  });

  it('leaves out the Send button without the extension route', async () => {
    ping.mockResolvedValue({
      kind: 'ready',
      profile: 'staff',
      protocol: 99,
      version: '0.1.22',
    });
    render(<SchoologyExportGuide kind="quizzes" canSend={false} />);
    await Promise.resolve();
    expect(ping).not.toHaveBeenCalled();
    expect(screen.queryByText('Send to SpartBoard')).not.toBeInTheDocument();
  });
});
