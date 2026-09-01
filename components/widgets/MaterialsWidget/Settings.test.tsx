import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { MaterialDefinition, MaterialsConfig, WidgetData } from '@/types';
import { TEACHER_MATERIAL_ID_PREFIX } from './constants';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(),
}));
vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: vi.fn(),
}));

const mockedUseDashboard = vi.mocked(useDashboard);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDialog = vi.mocked(useDialog);
const mockedUseWidgetBuildingId = vi.mocked(useWidgetBuildingId);

const GLUE: MaterialDefinition = {
  id: `${TEACHER_MATERIAL_ID_PREFIX}glue`,
  label: 'Glue Sticks',
  icon: 'Package',
  color: '#16a34a',
  textColor: '#ffffff',
};

const makeWidget = (config: Partial<MaterialsConfig> = {}): WidgetData => ({
  id: 'materials-test-1',
  type: 'materials',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: { selectedItems: [], activeItems: [], ...config },
});

const widget = makeWidget();

interface SetupOptions {
  customMaterials?: MaterialDefinition[];
  featurePermissions?: unknown[];
  buildingId?: string;
  dashboards?: unknown[];
  confirmResult?: boolean;
}

const setup = (options: SetupOptions = {}) => {
  const updateWidget = vi.fn();
  const saveCustomMaterials = vi.fn().mockResolvedValue(undefined);
  const updateWidgetConfigsAcrossBoards = vi.fn().mockResolvedValue(undefined);
  const showConfirm = vi.fn().mockResolvedValue(options.confirmResult ?? true);

  mockedUseDashboard.mockReturnValue({
    updateWidget,
    dashboards: options.dashboards ?? [],
    updateWidgetConfigsAcrossBoards,
  } as unknown as ReturnType<typeof useDashboard>);
  mockedUseAuth.mockReturnValue({
    featurePermissions: options.featurePermissions ?? [],
    customMaterials: options.customMaterials ?? [],
    saveCustomMaterials,
  } as unknown as ReturnType<typeof useAuth>);
  mockedUseDialog.mockReturnValue({ showConfirm } as unknown as ReturnType<
    typeof useDialog
  >);
  mockedUseWidgetBuildingId.mockReturnValue(options.buildingId);

  return {
    updateWidget,
    saveCustomMaterials,
    updateWidgetConfigsAcrossBoards,
    showConfirm,
  };
};

const materialsPermission = (config: Record<string, unknown>) => [
  { widgetType: 'materials', config },
];

describe('MaterialsSettings — group heading associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  // These headings render as <span> (a bare <label> labelling nothing is
  // ignored by screen readers), so the role=group + aria-labelledby pairing is
  // the only thing giving each button group an accessible name.
  it.each([['Typography'], ['Title Color'], ['Available Materials']])(
    'names the %s button group from its heading',
    (name) => {
      render(<MaterialsSettings widget={widget} />);

      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  );

  it('names the title text input from its label', () => {
    render(<MaterialsSettings widget={widget} />);

    expect(screen.getByLabelText('Title Text')).toHaveAttribute('type', 'text');
  });

  it('renders the headings as spans, not orphaned labels', () => {
    const { container } = render(<MaterialsSettings widget={widget} />);

    const orphanedLabels = Array.from(
      container.querySelectorAll('label')
    ).filter((el) => !el.getAttribute('for') && !el.querySelector('input'));
    expect(orphanedLabels).toHaveLength(0);
  });
});

describe('MaterialsSettings — teacher custom materials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a material, selects it, and leaves it inactive', async () => {
    const user = userEvent.setup();
    const { saveCustomMaterials, updateWidget } = setup();
    render(<MaterialsSettings widget={makeWidget({ selectedItems: [] })} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('New Material'), 'Glue Sticks');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const [saved] = saveCustomMaterials.mock.calls[0] as [MaterialDefinition[]];
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe('Glue Sticks');
    expect(saved[0].id.startsWith(TEACHER_MATERIAL_ID_PREFIX)).toBe(true);

    const [, updates] = updateWidget.mock.calls[0] as [
      string,
      { config: MaterialsConfig },
    ];
    expect(updates.config.selectedItems).toContain(saved[0].id);
    expect(updates.config.activeItems).not.toContain(saved[0].id);
  });

  it('trims the label and blocks saving an empty one', async () => {
    const user = userEvent.setup();
    const { saveCustomMaterials } = setup();
    render(<MaterialsSettings widget={widget} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(screen.getByLabelText('New Material'), '  Rulers  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const [saved] = saveCustomMaterials.mock.calls[0] as [MaterialDefinition[]];
    expect(saved[0].label).toBe('Rulers');
  });

  it('shows an edit button on custom rows only', () => {
    setup({ customMaterials: [GLUE] });
    render(<MaterialsSettings widget={widget} />);

    expect(
      screen.getByRole('button', { name: 'Edit Glue Sticks' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Pencil' })
    ).not.toBeInTheDocument();
  });

  it('hides the add button when the admin disables teacher materials', () => {
    setup({
      featurePermissions: materialsPermission({
        allowTeacherMaterials: false,
        buildingDefaults: {},
      }),
      customMaterials: [GLUE],
    });
    render(<MaterialsSettings widget={widget} />);

    expect(
      screen.queryByRole('button', { name: 'Add' })
    ).not.toBeInTheDocument();
    // Existing customs keep working — nobody loses work mid-year.
    expect(screen.getByText('Glue Sticks')).toBeInTheDocument();
  });

  it('keeps teacher materials visible when a building allowlist is set', () => {
    setup({
      featurePermissions: materialsPermission({
        buildingDefaults: {
          high: { buildingId: 'high', selectedItems: ['pencil'] },
        },
      }),
      customMaterials: [GLUE],
      buildingId: 'high',
    });
    render(<MaterialsSettings widget={widget} />);

    const list = screen.getByRole('group', { name: 'Available Materials' });
    expect(within(list).getByText('Pencil')).toBeInTheDocument();
    expect(within(list).getByText('Glue Sticks')).toBeInTheDocument();
    expect(within(list).queryByText('Computer')).not.toBeInTheDocument();
  });

  it('writes snapshots for referenced custom materials', async () => {
    const user = userEvent.setup();
    const { updateWidget } = setup({ customMaterials: [GLUE] });
    render(<MaterialsSettings widget={makeWidget({ selectedItems: [] })} />);

    await user.click(screen.getByText('Glue Sticks'));

    const [, updates] = updateWidget.mock.calls[0] as [
      string,
      { config: MaterialsConfig },
    ];
    expect(updates.config.customMaterialSnapshots).toEqual([GLUE]);
  });

  it('does not snapshot built-in materials', async () => {
    const user = userEvent.setup();
    const { updateWidget } = setup();
    render(<MaterialsSettings widget={makeWidget({ selectedItems: [] })} />);

    await user.click(screen.getByText('Pencil'));

    const [, updates] = updateWidget.mock.calls[0] as [
      string,
      { config: MaterialsConfig },
    ];
    expect(updates.config.customMaterialSnapshots).toEqual([]);
  });

  it('confirms with a usage count and cascades the delete', async () => {
    const user = userEvent.setup();
    const dashboards = [
      {
        id: 'a',
        widgets: [
          { id: 'w1', type: 'materials', config: { selectedItems: [GLUE.id] } },
          { id: 'w2', type: 'clock', config: {} },
        ],
      },
      {
        id: 'b',
        widgets: [
          { id: 'w3', type: 'materials', config: { activeItems: [GLUE.id] } },
          {
            id: 'w4',
            type: 'materials',
            config: { selectedItems: ['pencil'] },
          },
        ],
      },
    ];
    const {
      showConfirm,
      saveCustomMaterials,
      updateWidgetConfigsAcrossBoards,
    } = setup({ customMaterials: [GLUE], dashboards });
    render(<MaterialsSettings widget={widget} />);

    await user.click(screen.getByRole('button', { name: 'Edit Glue Sticks' }));
    await user.click(
      screen.getByRole('button', { name: 'Delete Glue Sticks' })
    );

    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('used on 2 widgets'),
      expect.objectContaining({ variant: 'danger' })
    );
    expect(saveCustomMaterials).toHaveBeenCalledWith([]);

    const [type, transform] = updateWidgetConfigsAcrossBoards.mock.calls[0] as [
      string,
      (config: MaterialsConfig) => MaterialsConfig | null,
    ];
    expect(type).toBe('materials');
    expect(
      transform({
        selectedItems: [GLUE.id, 'pencil'],
        activeItems: [GLUE.id],
        customMaterialSnapshots: [GLUE],
      })
    ).toEqual({
      selectedItems: ['pencil'],
      activeItems: [],
      customMaterialSnapshots: [],
    });
    expect(
      transform({ selectedItems: ['pencil'], activeItems: [] })
    ).toBeNull();
  });

  it('leaves the library alone when the delete is cancelled', async () => {
    const user = userEvent.setup();
    const { saveCustomMaterials, updateWidgetConfigsAcrossBoards } = setup({
      customMaterials: [GLUE],
      confirmResult: false,
    });
    render(<MaterialsSettings widget={widget} />);

    await user.click(screen.getByRole('button', { name: 'Edit Glue Sticks' }));
    await user.click(
      screen.getByRole('button', { name: 'Delete Glue Sticks' })
    );

    expect(saveCustomMaterials).not.toHaveBeenCalled();
    expect(updateWidgetConfigsAcrossBoards).not.toHaveBeenCalled();
  });

  it('edits a material in place without changing its id', async () => {
    const user = userEvent.setup();
    const { saveCustomMaterials } = setup({ customMaterials: [GLUE] });
    render(<MaterialsSettings widget={widget} />);

    await user.click(screen.getByRole('button', { name: 'Edit Glue Sticks' }));
    const input = screen.getByLabelText('Edit Material');
    await user.clear(input);
    await user.type(input, 'Glue');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveCustomMaterials).toHaveBeenCalledWith([
      expect.objectContaining({ id: GLUE.id, label: 'Glue' }),
    ]);
  });
});
