import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MagicInput } from '@/components/common/MagicInput';
import { describe, it, expect, vi } from 'vitest';

describe('MagicInput', () => {
  it('renders correctly', () => {
    render(
      <MagicInput
        onGenerate={() => Promise.resolve('success')}
        onSuccess={vi.fn()}
        placeholder="Type here"
      />
    );
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('calls onGenerate and onSuccess when button is clicked', async () => {
    const onGenerate = vi.fn().mockResolvedValue('result');
    const onSuccess = vi.fn();

    render(
      <MagicInput
        onGenerate={onGenerate}
        onSuccess={onSuccess}
        placeholder="Type here"
      />
    );

    const input = screen.getByPlaceholderText('Type here');
    fireEvent.change(input, { target: { value: 'test prompt' } });

    const button = screen.getByText('Generate');
    fireEvent.click(button);

    expect(onGenerate).toHaveBeenCalledWith('test prompt');

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('result');
    });

    // Input should be cleared
    expect(input).toHaveValue('');
  });

  it('displays error message on failure', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('Test Error'));
    const onSuccess = vi.fn();

    render(
      <MagicInput
        onGenerate={onGenerate}
        onSuccess={onSuccess}
        placeholder="Type here"
      />
    );

    const input = screen.getByPlaceholderText('Type here');
    fireEvent.change(input, { target: { value: 'fail' } });

    const button = screen.getByText('Generate');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Test Error')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
