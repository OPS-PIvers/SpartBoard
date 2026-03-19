import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeatingChartSidebar } from './SeatingChartSidebar';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SeatingChartConfig } from '@/types';
import { DEFAULT_TEMPLATE_COLUMNS } from './constants';

const TEST_COLUMN_COUNT_VALID = 8;

describe('SeatingChartSidebar', () => {
  const defaultProps = {
    mode: 'setup' as const,
    widgetId: 'test-widget',
    config: {
      template: 'freeform',
      templateColumns: DEFAULT_TEMPLATE_COLUMNS,
    } as SeatingChartConfig,
    updateWidget: vi.fn(),
    template: 'freeform' as const,
    localTemplateColumns: String(DEFAULT_TEMPLATE_COLUMNS),
    setLocalTemplateColumns: vi.fn(),
    studentCount: 20,
    applyTemplate: vi.fn(),
    addFurniture: vi.fn(),
    clearAllFurniture: vi.fn(),
    unassignedStudents: [
      { id: '1', label: 'Alice A.' },
      { id: '2', label: 'Bob B.' },
    ],
    addAllRandomly: vi.fn(),
    handleStudentClick: vi.fn(),
    selectedStudent: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing if mode is interact', () => {
    const { container } = render(
      <SeatingChartSidebar {...defaultProps} mode="interact" />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('Setup Mode', () => {
    it('renders template options', () => {
      render(<SeatingChartSidebar {...defaultProps} />);
      expect(screen.getByText('Freeform')).toBeInTheDocument();
      expect(screen.getByText('Rows')).toBeInTheDocument();
      expect(screen.getByText('Pods')).toBeInTheDocument();
      expect(screen.getByText('Horseshoe')).toBeInTheDocument();
    });

    it('calls updateWidget when a template is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} />);
      const user = userEvent.setup();
      const podsButton = screen.getByRole('button', { name: /pods/i });
      await user.click(podsButton);
      expect(defaultProps.updateWidget).toHaveBeenCalledWith('test-widget', {
        config: expect.objectContaining({ template: 'pods' }) as Record<
          string,
          unknown
        >,
      });
    });

    it('renders columns input when template is rows', () => {
      render(<SeatingChartSidebar {...defaultProps} template="rows" />);
      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(DEFAULT_TEMPLATE_COLUMNS);
    });

    it('updates localTemplateColumns and config on valid column input', () => {
      render(<SeatingChartSidebar {...defaultProps} template="rows" />);
      const input = screen.getByRole('spinbutton');

      // user.clear doesn't always trigger change properly on number inputs in JSDOM,
      // so we select all text first or use fireEvent.
      fireEvent.change(input, {
        target: { value: String(TEST_COLUMN_COUNT_VALID) },
      });

      expect(defaultProps.setLocalTemplateColumns).toHaveBeenCalledWith(
        String(TEST_COLUMN_COUNT_VALID)
      );
      expect(defaultProps.updateWidget).toHaveBeenCalledWith('test-widget', {
        config: expect.objectContaining({
          templateColumns: TEST_COLUMN_COUNT_VALID,
        }) as Record<string, unknown>,
      });
    });

    it('handles column input blur with invalid value', async () => {
      render(
        <SeatingChartSidebar
          {...defaultProps}
          template="rows"
          localTemplateColumns="invalid"
        />
      );
      const user = userEvent.setup();
      const input = screen.getByRole('spinbutton');
      await user.click(input);
      await user.tab(); // Blur
      expect(defaultProps.setLocalTemplateColumns).toHaveBeenCalledWith(
        String(DEFAULT_TEMPLATE_COLUMNS)
      );
    });

    it('calls applyTemplate when Apply Layout button is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} template="rows" />);
      const user = userEvent.setup();
      const applyButton = screen.getByRole('button', { name: /apply layout/i });
      await user.click(applyButton);
      expect(defaultProps.applyTemplate).toHaveBeenCalled();
    });

    it('disables Apply Layout button for freeform template', () => {
      render(<SeatingChartSidebar {...defaultProps} template="freeform" />);
      const applyButton = screen.getByRole('button', { name: /apply layout/i });
      expect(applyButton).toBeDisabled();
    });

    it('disables Apply Layout button if studentCount is 0 (except for horseshoe)', () => {
      render(
        <SeatingChartSidebar
          {...defaultProps}
          template="rows"
          studentCount={0}
        />
      );
      expect(
        screen.getByRole('button', { name: /apply layout/i })
      ).toBeDisabled();
    });

    it('enables Apply Layout button if studentCount is 0 for horseshoe template', () => {
      render(
        <SeatingChartSidebar
          {...defaultProps}
          template="horseshoe"
          studentCount={0}
        />
      );
      expect(
        screen.getByRole('button', { name: /apply layout/i })
      ).not.toBeDisabled();
    });

    it('calls addFurniture when a manual add button is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} />);
      const user = userEvent.setup();
      const addDeskButton = screen.getByRole('button', { name: /desk/i });
      await user.click(addDeskButton);
      expect(defaultProps.addFurniture).toHaveBeenCalledWith('desk');
    });

    it('calls clearAllFurniture when Reset Canvas button is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} />);
      const user = userEvent.setup();
      const resetButton = screen.getByRole('button', { name: /reset canvas/i });
      await user.click(resetButton);
      expect(defaultProps.clearAllFurniture).toHaveBeenCalled();
    });
  });

  describe('Assign Mode', () => {
    it('renders unassigned students', () => {
      render(<SeatingChartSidebar {...defaultProps} mode="assign" />);
      expect(screen.getByText('Alice A.')).toBeInTheDocument();
      expect(screen.getByText('Bob B.')).toBeInTheDocument();
    });

    it('displays "All assigned!" when there are no unassigned students', () => {
      render(
        <SeatingChartSidebar
          {...defaultProps}
          mode="assign"
          unassignedStudents={[]}
        />
      );
      expect(screen.getByText('All assigned!')).toBeInTheDocument();
    });

    it('calls handleStudentClick when a student is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} mode="assign" />);
      const user = userEvent.setup();
      const studentElement = screen.getByText('Alice A.');
      await user.click(studentElement);
      expect(defaultProps.handleStudentClick).toHaveBeenCalledWith('1');
    });

    it('applies selected style to selected student', () => {
      render(
        <SeatingChartSidebar
          {...defaultProps}
          mode="assign"
          selectedStudent="1"
        />
      );
      const studentElement = screen.getByText('Alice A.');
      expect(studentElement.className).toContain('ring-indigo-200');
    });

    it('calls addAllRandomly when Add All Random button is clicked', async () => {
      render(<SeatingChartSidebar {...defaultProps} mode="assign" />);
      const user = userEvent.setup();
      const addRandomButton = screen.getByRole('button', {
        name: /add all random/i,
      });
      await user.click(addRandomButton);
      expect(defaultProps.addAllRandomly).toHaveBeenCalled();
    });

    it('sets drag data when student is dragged', () => {
      render(<SeatingChartSidebar {...defaultProps} mode="assign" />);
      const studentElement = screen.getByText('Alice A.');
      const setDataMock = vi.fn();
      fireEvent.dragStart(studentElement, {
        dataTransfer: { setData: setDataMock },
      });
      expect(setDataMock).toHaveBeenCalledWith('studentId', '1');
    });
  });
});
