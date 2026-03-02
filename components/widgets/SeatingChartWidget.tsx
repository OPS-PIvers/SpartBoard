import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../../context/useDashboard';
import {
  WidgetData,
  SeatingChartConfig,
  FurnitureItem,
  SeatingChartTemplate,
} from '../../types';
import {
  Armchair,
  LayoutGrid,
  RotateCw,
  RotateCcw,
  Trash2,
  Monitor,
  Dice5,
  User,
  UserPlus,
  RefreshCw,
  Rows3,
  Grip,
  LayoutTemplate,
  MousePointer2,
} from 'lucide-react';
import { Button } from '../common/Button';
import {
  generateColumnsLayout,
  generateHorseshoeLayout,
  generatePodsLayout,
} from './seatingChartLayouts';
import { FurnitureItemRenderer } from './FurnitureItemRenderer';

// Furniture definitions for palette
const FURNITURE_TYPES: {
  type: FurnitureItem['type'];
  label: string;
  w: number;
  h: number;
  icon: React.ElementType;
}[] = [
  { type: 'desk', label: 'Desk', w: 80, h: 65, icon: Monitor },
  {
    type: 'table-rect',
    label: 'Table (Rect)',
    w: 120,
    h: 80,
    icon: LayoutGrid,
  },
  {
    type: 'table-round',
    label: 'Table (Round)',
    w: 100,
    h: 100,
    icon: LayoutGrid,
  },
  { type: 'rug', label: 'Rug', w: 150, h: 100, icon: Armchair },
  { type: 'teacher-desk', label: 'Teacher', w: 100, h: 60, icon: User },
];

// UI chrome sizes — must match the Tailwind classes used in the layout
// (w-48 sidebar = 192px, h-12 toolbar = 48px). Named here so a future
// layout change only requires updating one place.
const SETUP_SIDEBAR_W = 192;
const TOOLBAR_H = 48;
// Minimum safe canvas dimension to avoid zero/negative spacing in generators
const MIN_CANVAS_DIM = 200;

// Template metadata for UI
const TEMPLATES: {
  id: SeatingChartTemplate;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: 'freeform',
    label: 'Freeform',
    icon: LayoutTemplate,
    description: 'Place desks freely',
  },
  {
    id: 'rows',
    label: 'Rows',
    icon: Rows3,
    description: 'Evenly spaced rows',
  },
  {
    id: 'horseshoe',
    label: 'Horseshoe',
    icon: Armchair,
    description: 'Inner & outer U',
  },
  {
    id: 'pods',
    label: 'Pods',
    icon: Grip,
    description: 'Groups of 4',
  },
];

// Drag state tracks current positions for all items being dragged simultaneously
type DragPositions = Map<string, { x: number; y: number }>;

// Rubber-band selection rectangle in canvas-space coordinates
interface RubberBand {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EMPTY_ARRAY: { id: string; label: string }[] = [];

export const SeatingChartWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const { updateWidget, rosters, activeRosterId, addToast } = useDashboard();
  const config = widget.config as SeatingChartConfig;
  // Fall back to the legacy templateRows field so existing Firestore widgets
  // preserve their saved column count after the rename to templateColumns.
  const legacyTemplateRows = (
    config as SeatingChartConfig & { templateRows?: number }
  ).templateRows;
  const {
    furniture = [],
    assignments = {},
    gridSize = 20,
    rosterMode = 'class',
    template = 'freeform',
    templateColumns = legacyTemplateRows ?? 6,
  } = config;

  const [mode, setMode] = useState<'setup' | 'assign' | 'interact'>('interact');

  // Multi-select: a Set of selected furniture IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Drag: maps each dragged item id → its current position during the drag
  const [dragState, setDragState] = useState<DragPositions | null>(null);

  const [resizeState, setResizeState] = useState<{
    id: string;
    width: number;
    height: number;
  } | null>(null);

  const [randomHighlight, setRandomHighlight] = useState<string | null>(null);

  // Rubber-band selection state (visual rect while dragging on empty canvas)
  const [rubberBand, setRubberBand] = useState<RubberBand | null>(null);

  // Local state for the columns-count input so users can clear/type freely
  // without the field snapping back to the previous valid value on each keystroke.
  const [localTemplateColumns, setLocalTemplateColumns] = useState(
    String(templateColumns)
  );

  // Ensures the legacy name→id migration runs at most once per widget mount,
  // preventing re-runs triggered by the state update from updateWidget itself.
  const migrationDoneRef = useRef(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Tracks whether the last pointerDown on a furniture item was a Ctrl/Meta
  // click so we can suppress the subsequent onClick firing a second toggle.
  const suppressNextClickRef = useRef(false);

  // Tracks whether the canvas onPointerDown ended with a rubber-band selection,
  // so that the subsequent onClick on the canvas doesn't clear the new selection.
  const suppressNextCanvasClickRef = useRef(false);

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  // Keep local input in sync when templateColumns changes from outside
  useEffect(() => {
    setLocalTemplateColumns(String(templateColumns));
  }, [templateColumns]);

  // Roster logic
  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  // Always returns {id, label}[] so the assignment key is always `student.id`.
  // In class mode, id = student UUID (keeps PII out of Firestore).
  // In custom mode, id = name string (same as before, stored in Drive only).
  const students = useMemo((): { id: string; label: string }[] => {
    if (rosterMode === 'class' && activeRoster) {
      return activeRoster.students.map((s) => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName}`.trim(),
      }));
    }
    if (rosterMode === 'custom' && config.names) {
      return config.names
        .split('\n')
        .map((n) => n.trim())
        .filter((n) => n !== '')
        .map((n) => ({ id: n, label: n }));
    }
    return [];
  }, [activeRoster, rosterMode, config.names]);

  // Build a label lookup map for fast id → display-name resolution
  const studentLabelById = useMemo(
    () => new Map(students.map((s) => [s.id, s.label])),
    [students]
  );

  const assignedStudentIds = new Set(Object.keys(assignments));
  const unassignedStudents = students.filter(
    (s) => !assignedStudentIds.has(s.id)
  );

  // --- LEGACY MIGRATION: name-keyed → id-keyed assignments ---
  // Prior to adding roster support, seating-chart assignments used student
  // display names as keys. Now that class-mode uses the student UUID as the
  // key (keeping PII out of Firestore), we remap any legacy name-string keys
  // to their corresponding student IDs on first load.
  useEffect(() => {
    // Guard prevents re-running when updateWidget triggers a re-render
    if (migrationDoneRef.current) return;
    if (rosterMode !== 'class' || students.length === 0) return;
    const assignmentKeys = Object.keys(assignments);
    if (assignmentKeys.length === 0) return;

    const studentIds = new Set(students.map((s) => s.id));
    const hasLegacyKeys = assignmentKeys.some((key) => !studentIds.has(key));
    if (!hasLegacyKeys) return;

    migrationDoneRef.current = true;
    const nameToId = new Map(students.map((s) => [s.label, s.id]));
    const migrated: Record<string, string> = {};
    const unmappedLegacyKeys: string[] = [];

    for (const [key, furnitureId] of Object.entries(assignments)) {
      if (studentIds.has(key)) {
        migrated[key] = furnitureId;
        continue;
      }
      const resolvedId = nameToId.get(key);
      if (resolvedId) {
        migrated[resolvedId] = furnitureId;
      } else {
        migrated[key] = furnitureId;
        unmappedLegacyKeys.push(key);
      }
    }

    if (unmappedLegacyKeys.length > 0) {
      console.warn(
        'SeatingChartWidget: Unable to migrate some legacy seating assignments to student IDs.',
        {
          widgetId: widget.id,
          unmappedLegacyKeys,
        }
      );
    }
    updateWidget(widget.id, { config: { ...config, assignments: migrated } });
  }, [rosterMode, students, assignments, config, updateWidget, widget.id]);

  // Optimization: Pre-compute assignments map to avoid O(N) filtering and new array references on every render.
  // Assignments now map studentIds -> furnitureId, so we resolve the studentId to the display label here.
  const assignedStudentsByFurnitureId = useMemo(() => {
    const map = new Map<string, { id: string; label: string }[]>();
    Object.entries(assignments).forEach(([studentId, furnitureId]) => {
      const label = studentLabelById.get(studentId) ?? studentId;
      const list = map.get(furnitureId);
      if (list) {
        list.push({ id: studentId, label });
      } else {
        map.set(furnitureId, [{ id: studentId, label }]);
      }
    });
    return map;
  }, [assignments, studentLabelById]);

  // --- OPTIMIZATION START ---
  // Store latest state/props in ref to avoid re-creating handlers.
  // This ensures that passing these handlers to memoized children (FurnitureItemRenderer)
  // does not cause unnecessary re-renders when other unrelated state changes.
  const latestRef = useRef({
    config,
    furniture,
    assignments,
    mode,
    selectedIds,
    selectedStudent,
    studentLabelById,
  });

  // Keep ref up to date
  useLayoutEffect(() => {
    Object.assign(latestRef.current, {
      config,
      furniture,
      assignments,
      mode,
      selectedIds,
      selectedStudent,
      studentLabelById,
    });
  });
  // --- OPTIMIZATION END ---

  // --- SCALE HELPER ---
  const getCanvasScale = useCallback((): number => {
    const el = canvasRef.current;
    if (!el || el.offsetWidth === 0) return 1;
    return el.getBoundingClientRect().width / el.offsetWidth;
  }, []);

  // Convert a client-space pointer event coordinate to canvas-space
  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const el = canvasRef.current;
      if (!el) return { x: clientX, y: clientY };
      const rect = el.getBoundingClientRect();
      const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    []
  );

  // --- FURNITURE ACTIONS ---

  const addFurniture = (type: FurnitureItem['type']) => {
    const def = FURNITURE_TYPES.find((t) => t.type === type);
    if (!def) return;

    const newItem: FurnitureItem = {
      id: crypto.randomUUID(),
      type,
      x: widget.w / 2 - def.w / 2,
      y: widget.h / 2 - def.h / 2,
      width: def.w,
      height: def.h,
      rotation: 0,
    };

    updateWidget(widget.id, {
      config: { ...config, furniture: [...furniture, newItem] },
    });
    setSelectedIds(new Set([newItem.id]));
  };

  const clearAllFurniture = () => {
    if (
      window.confirm(
        'Are you sure you want to remove all furniture and assignments?'
      )
    ) {
      updateWidget(widget.id, {
        config: { ...config, furniture: [], assignments: {} },
      });
      setSelectedIds(new Set());
    }
  };

  const handleRotate = useCallback(
    (id: string, delta: number) => {
      const { furniture: curFurniture, config: curConfig } = latestRef.current;
      const next = curFurniture.map((f) =>
        f.id === id ? { ...f, rotation: (f.rotation + delta + 360) % 360 } : f
      );
      updateWidget(widget.id, {
        config: { ...curConfig, furniture: next },
      });
    },
    [widget.id, updateWidget]
  );

  const duplicateFurniture = useCallback(
    (id: string) => {
      const { furniture: curFurniture, config: curConfig } = latestRef.current;
      const item = curFurniture.find((f) => f.id === id);
      if (!item) return;

      const newItem: FurnitureItem = {
        ...item,
        id: crypto.randomUUID(),
        x: Math.round((item.x + 20) / gridSize) * gridSize,
        y: Math.round((item.y + 20) / gridSize) * gridSize,
      };

      updateWidget(widget.id, {
        config: { ...curConfig, furniture: [...curFurniture, newItem] },
      });
      setSelectedIds(new Set([newItem.id]));
    },
    [gridSize, widget.id, updateWidget]
  );

  const removeFurniture = useCallback(
    (id: string) => {
      const {
        furniture: curFurniture,
        assignments: curAssignments,
        config: curConfig,
      } = latestRef.current;
      const next = curFurniture.filter((f) => f.id !== id);
      const nextAssignments = { ...curAssignments };
      Object.entries(curAssignments).forEach(([student, furnId]) => {
        if (furnId === id) delete nextAssignments[student];
      });
      updateWidget(widget.id, {
        config: { ...curConfig, furniture: next, assignments: nextAssignments },
      });
      setSelectedIds(new Set());
    },
    [widget.id, updateWidget]
  );

  // --- GROUP OPERATIONS (multi-select) ---

  const rotateSelected = (delta: number) => {
    const next = furniture.map((f) =>
      selectedIds.has(f.id)
        ? { ...f, rotation: (f.rotation + delta + 360) % 360 }
        : f
    );
    updateWidget(widget.id, { config: { ...config, furniture: next } });
  };

  const deleteSelected = () => {
    const next = furniture.filter((f) => !selectedIds.has(f.id));
    const nextAssignments = { ...assignments };
    Object.entries(assignments).forEach(([student, furnId]) => {
      if (selectedIds.has(furnId)) delete nextAssignments[student];
    });
    updateWidget(widget.id, {
      config: { ...config, furniture: next, assignments: nextAssignments },
    });
    setSelectedIds(new Set());
  };

  // --- TEMPLATE ACTIONS ---

  const applyTemplate = () => {
    const numStudents = students.length;

    if (numStudents === 0 && template !== 'horseshoe') {
      addToast(
        'No students found. Set a class or custom roster first.',
        'error'
      );
      return;
    }

    const canvasEl = canvasRef.current;
    const rawCanvasW = canvasEl
      ? canvasEl.offsetWidth
      : widget.w - SETUP_SIDEBAR_W;
    const rawCanvasH = canvasEl ? canvasEl.offsetHeight : widget.h - TOOLBAR_H;
    const canvasW = Math.max(MIN_CANVAS_DIM, rawCanvasW);
    const canvasH = Math.max(MIN_CANVAS_DIM, rawCanvasH);

    let newFurniture: FurnitureItem[] = [];

    if (template === 'rows') {
      const cols = Math.max(1, templateColumns);
      newFurniture = generateColumnsLayout(
        numStudents,
        cols,
        canvasW,
        canvasH,
        gridSize
      );
    } else if (template === 'horseshoe') {
      newFurniture = generateHorseshoeLayout(
        numStudents,
        canvasW,
        canvasH,
        gridSize
      );
    } else if (template === 'pods') {
      newFurniture = generatePodsLayout(
        numStudents,
        canvasW,
        canvasH,
        gridSize
      );
    }

    updateWidget(widget.id, {
      config: { ...config, furniture: newFurniture, assignments: {} },
    });
    setSelectedIds(new Set());
    addToast(
      `Applied ${template} layout with ${newFurniture.length} desks.`,
      'success'
    );
  };

  const handleStudentClick = (studentId: string) => {
    if (mode !== 'assign') return;
    setSelectedStudent(selectedStudent === studentId ? null : studentId);
  };

  const handleFurnitureClick = useCallback(
    (furnitureId: string) => {
      const {
        mode: curMode,
        selectedStudent: curSelectedStudent,
        studentLabelById: curStudentLabelById,
        config: curConfig,
        assignments: curAssignments,
      } = latestRef.current;

      // Ctrl/Meta click was already handled in handlePointerDown — suppress here
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      if (curMode === 'setup') {
        // Regular click in setup mode: select only this item
        setSelectedIds(new Set([furnitureId]));
        return;
      }
      if (curMode === 'assign' && curSelectedStudent) {
        updateWidget(widget.id, {
          config: {
            ...curConfig,
            assignments: {
              ...curAssignments,
              [curSelectedStudent]: furnitureId,
            },
          },
        });
        setSelectedStudent(null);
        addToast(
          `Assigned ${curStudentLabelById.get(curSelectedStudent) ?? curSelectedStudent}`,
          'success'
        );
      }
    },
    [widget.id, updateWidget, addToast]
  );

  // --- DRAG LOGIC (single + multi-item) ---

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      const {
        mode: curMode,
        selectedIds: curSelectedIds,
        furniture: curFurniture,
      } = latestRef.current;

      if (curMode !== 'setup') return;
      e.stopPropagation();
      e.preventDefault();

      // Ctrl / Meta + click → toggle item in/out of selection, no drag
      if (e.ctrlKey || e.metaKey) {
        suppressNextClickRef.current = true;
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        return;
      }

      // Determine the set of items to drag:
      // - if the clicked item is already selected, drag all selected items
      // - otherwise, select only the clicked item and drag it
      const idsForDrag: Set<string> = curSelectedIds.has(id)
        ? new Set(curSelectedIds)
        : new Set([id]);

      if (!curSelectedIds.has(id)) {
        setSelectedIds(new Set([id]));
      }

      const startX = e.clientX;
      const startY = e.clientY;
      const canvasScale = getCanvasScale();

      // Capture the initial positions of every item in the drag set (single O(N) pass)
      const origPositions = new Map<string, { x: number; y: number }>();
      curFurniture.forEach((item) => {
        if (idsForDrag.has(item.id)) {
          origPositions.set(item.id, { x: item.x, y: item.y });
        }
      });

      // Mutable copy updated on every pointermove (used in the pointerup closure)
      const currentPositions = new Map(origPositions);
      setDragState(new Map(origPositions));

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - startX) / canvasScale;
        const dy = (moveEvent.clientY - startY) / canvasScale;

        for (const [selId, orig] of origPositions) {
          currentPositions.set(selId, {
            x: Math.round((orig.x + dx) / gridSize) * gridSize,
            y: Math.round((orig.y + dy) / gridSize) * gridSize,
          });
        }
        setDragState(new Map(currentPositions));
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        // Commit all moved positions in a single update
        const { furniture: upFurniture, config: upConfig } = latestRef.current;

        const next = upFurniture.map((f) => {
          const pos = currentPositions.get(f.id);
          return pos ? { ...f, ...pos } : f;
        });
        updateWidget(widget.id, { config: { ...upConfig, furniture: next } });
        setDragState(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [getCanvasScale, gridSize, widget.id, updateWidget]
  );

  // --- RUBBER-BAND (canvas background drag to select) ---

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'setup') return;
    e.stopPropagation();

    // Capture from the synthetic event before it gets recycled
    const isCtrl = e.ctrlKey || e.metaKey;
    if (e.button !== 0) return;

    const start = getCanvasCoords(e.clientX, e.clientY);
    let cur = { ...start };
    let hasMoved = false;

    const handleMove = (mv: PointerEvent) => {
      cur = getCanvasCoords(mv.clientX, mv.clientY);
      const dx = Math.abs(cur.x - start.x);
      const dy = Math.abs(cur.y - start.y);
      if (dx > 4 || dy > 4) {
        hasMoved = true;
        setRubberBand({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setRubberBand(null);

      if (!hasMoved) return;

      // Rubber-band ended — suppress the upcoming onClick so it doesn't clear selection
      suppressNextCanvasClickRef.current = true;

      // Normalise rect
      const rx1 = Math.min(start.x, cur.x);
      const ry1 = Math.min(start.y, cur.y);
      const rx2 = Math.max(start.x, cur.x);
      const ry2 = Math.max(start.y, cur.y);

      // Select all furniture whose centre falls inside the rubber-band rect
      const hit = new Set<string>();
      for (const item of furniture) {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        if (cx >= rx1 && cx <= rx2 && cy >= ry1 && cy <= ry2) {
          hit.add(item.id);
        }
      }

      if (isCtrl) {
        setSelectedIds((prev) => new Set([...prev, ...hit]));
      } else {
        setSelectedIds(hit);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // If a rubber-band selection just finished, don't clear it
    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      return;
    }
    if (!e.ctrlKey && !e.metaKey) {
      setSelectedIds(new Set());
    }
  };

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const { furniture: curFurniture } = latestRef.current;
      const item = curFurniture.find((f) => f.id === id);
      if (!item) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = item.width;
      const startH = item.height;
      const currentSize = { w: startW, h: startH };

      const canvasScale = getCanvasScale();

      setResizeState({ id, width: startW, height: startH });

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const dx = (moveEvent.clientX - startX) / canvasScale;
        const dy = (moveEvent.clientY - startY) / canvasScale;

        let newW = Math.round((startW + dx) / gridSize) * gridSize;
        let newH = Math.round((startH + dy) / gridSize) * gridSize;

        if (newW < gridSize) newW = gridSize;
        if (newH < gridSize) newH = gridSize;

        currentSize.w = newW;
        currentSize.h = newH;
        setResizeState({ id, width: newW, height: newH });
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);

        const { furniture: upFurniture, config: upConfig } = latestRef.current;
        const next = upFurniture.map((f) =>
          f.id === id
            ? { ...f, width: currentSize.w, height: currentSize.h }
            : f
        );
        updateWidget(widget.id, {
          config: { ...upConfig, furniture: next },
        });

        setResizeState(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [getCanvasScale, gridSize, widget.id, updateWidget]
  );

  // --- ASSIGN LOGIC (Students) ---

  const handleStudentDrop = useCallback(
    (e: React.DragEvent, furnitureId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const {
        mode: curMode,
        assignments: curAssignments,
        config: curConfig,
      } = latestRef.current;

      if (curMode !== 'assign') return;

      const studentId = e.dataTransfer.getData('studentId');
      if (!studentId) return;

      if (curAssignments[studentId] === furnitureId) return;

      updateWidget(widget.id, {
        config: {
          ...curConfig,
          assignments: { ...curAssignments, [studentId]: furnitureId },
        },
      });
    },
    [widget.id, updateWidget]
  );

  const handleRemoveAssignment = useCallback(
    (studentId: string) => {
      const { assignments: curAssignments, config: curConfig } =
        latestRef.current;
      const next = { ...curAssignments };
      delete next[studentId];
      updateWidget(widget.id, { config: { ...curConfig, assignments: next } });
    },
    [widget.id, updateWidget]
  );

  const addAllRandomly = () => {
    const targetFurniture = furniture.filter(
      (f) => f.type === 'desk' || f.type.startsWith('table')
    );

    if (targetFurniture.length === 0) {
      addToast('No desks or tables available!', 'error');
      return;
    }

    const unassigned = [...unassignedStudents];
    if (unassigned.length === 0) {
      addToast('All students are already assigned!', 'info');
      return;
    }

    for (let i = unassigned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]];
    }

    const occupiedIds = new Set(Object.values(assignments));
    const emptySpots = targetFurniture
      .filter((f) => !occupiedIds.has(f.id))
      .map((f) => f.id);

    if (emptySpots.length === 0) {
      addToast('No empty spots available!', 'error');
      return;
    }

    for (let i = emptySpots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emptySpots[i], emptySpots[j]] = [emptySpots[j], emptySpots[i]];
    }

    const nextAssignments = { ...assignments };
    let count = 0;
    while (unassigned.length > 0 && emptySpots.length > 0) {
      const student = unassigned.pop();
      const spotId = emptySpots.pop();
      if (student && spotId) {
        nextAssignments[student.id] = spotId;
        count++;
      }
    }

    updateWidget(widget.id, {
      config: { ...config, assignments: nextAssignments },
    });

    if (unassigned.length > 0) {
      addToast(
        `Assigned ${count} students. ${unassigned.length} still need spots.`,
        'info'
      );
    } else {
      addToast(`Randomly assigned ${count} students!`, 'success');
    }
  };

  // --- INTERACT LOGIC ---

  const pickRandom = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }

    const occupiedFurnitureIds = Object.values(assignments);
    if (occupiedFurnitureIds.length === 0) {
      addToast('No students assigned to seats!', 'info');
      return;
    }

    const uniqueIds = [...new Set(occupiedFurnitureIds)];

    let count = 0;
    const max = 15;
    animationIntervalRef.current = setInterval(() => {
      const rnd = uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
      setRandomHighlight(rnd);
      count++;
      if (count > max) {
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
          animationIntervalRef.current = null;
        }
        const winner = uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
        setRandomHighlight(winner);
      }
    }, 100);
  };

  // --- RENDERING ---

  const studentCount = students.length;
  const multiSelected = selectedIds.size > 1;

  // Rubber-band visual rect in canvas-space
  const rbStyle = rubberBand
    ? {
        left: Math.min(rubberBand.x1, rubberBand.x2),
        top: Math.min(rubberBand.y1, rubberBand.y2),
        width: Math.abs(rubberBand.x2 - rubberBand.x1),
        height: Math.abs(rubberBand.y2 - rubberBand.y1),
      }
    : null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-2 justify-between shrink-0">
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setMode('interact')}
            className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'interact' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Interact
          </button>
          <button
            onClick={() => setMode('assign')}
            className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'assign' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Assign
          </button>
          <button
            onClick={() => setMode('setup')}
            className={`px-3 py-1 text-xs font-black uppercase rounded-md transition-all ${mode === 'setup' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Setup
          </button>
        </div>

        {mode === 'interact' && (
          <Button
            onClick={pickRandom}
            variant="primary"
            size="sm"
            icon={<Dice5 className="w-4 h-4" />}
            className="ml-auto"
            disabled={!!animationIntervalRef.current}
          >
            Pick Random
          </Button>
        )}

        {/* Multi-select group action bar */}
        {mode === 'setup' && multiSelected && (
          <div className="ml-auto flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1">
            <MousePointer2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-xxs font-black text-indigo-600 uppercase tracking-wide">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-4 bg-indigo-200 mx-0.5" />
            <button
              onClick={() => rotateSelected(-45)}
              className="p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
              title="Rotate all left 45°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => rotateSelected(45)}
              className="p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
              title="Rotate all right 45°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-indigo-200 mx-0.5" />
            <button
              onClick={deleteSelected}
              className="p-1 hover:bg-red-50 rounded text-red-500 transition-colors"
              title="Delete all selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {(mode === 'setup' || mode === 'assign') && (
          <div className="w-48 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-left-4 duration-200">
            {mode === 'setup' && (
              <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
                {/* Template Picker */}
                <div className="p-3 border-b border-slate-200">
                  <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-2">
                    Template
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() =>
                          updateWidget(widget.id, {
                            config: { ...config, template: t.id },
                          })
                        }
                        title={t.description}
                        className={`flex flex-col items-center justify-center gap-1 p-2 border rounded-lg transition-all text-xxs font-black uppercase leading-none ${
                          template === t.id
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-1 ring-indigo-300'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <t.icon className="w-4 h-4" />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Columns count input */}
                  {template === 'rows' && (
                    <div className="mt-2">
                      <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-1">
                        # of Columns
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={localTemplateColumns}
                        onChange={(e) => {
                          setLocalTemplateColumns(e.target.value);
                          const parsed = Number.parseInt(e.target.value, 10);
                          if (!Number.isNaN(parsed)) {
                            updateWidget(widget.id, {
                              config: {
                                ...config,
                                templateColumns: Math.min(
                                  20,
                                  Math.max(1, parsed)
                                ),
                              },
                            });
                          }
                        }}
                        onBlur={() => {
                          const parsed = Number.parseInt(
                            localTemplateColumns,
                            10
                          );
                          if (Number.isNaN(parsed)) {
                            setLocalTemplateColumns(String(templateColumns));
                          }
                        }}
                        className="w-full p-2 text-xs border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-black"
                      />
                    </div>
                  )}

                  {/* Student count hint */}
                  <p className="text-xxs text-slate-400 mt-2 text-center">
                    {studentCount > 0
                      ? `${studentCount} students`
                      : 'No roster set'}
                  </p>

                  {/* Apply button */}
                  <button
                    onClick={applyTemplate}
                    disabled={
                      template === 'freeform' ||
                      (studentCount === 0 && template !== 'horseshoe')
                    }
                    className="mt-2 w-full flex items-center justify-center gap-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Apply Layout
                  </button>
                </div>

                {/* Multi-select hint */}
                <div className="px-3 py-2 border-b border-slate-200 bg-indigo-50/50">
                  <p className="text-xxs text-indigo-500 font-bold leading-tight">
                    <span className="font-black">Ctrl+Click</span> to add/remove
                    from selection.{' '}
                    <span className="font-black">Drag empty space</span> to
                    rubber-band select.
                  </p>
                </div>

                {/* Manual Add */}
                <div className="p-3 border-b border-slate-200">
                  <label className="text-xxs font-black text-slate-500 uppercase tracking-widest block mb-2">
                    Add Manually
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {FURNITURE_TYPES.map((t) => (
                      <button
                        key={t.type}
                        onClick={() => addFurniture(t.type)}
                        className="flex flex-col items-center justify-center gap-1 p-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors aspect-square shadow-sm"
                      >
                        <t.icon className="w-6 h-6 text-slate-600" />
                        <span className="text-xxs font-black uppercase text-slate-500">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reset */}
                <div className="mt-auto p-3">
                  <button
                    onClick={clearAllFurniture}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Reset Canvas
                  </button>
                </div>
              </div>
            )}

            {mode === 'assign' && (
              <div className="flex flex-col h-full">
                <div className="p-2 border-b border-slate-200 bg-slate-100 text-xxs font-black uppercase text-slate-600 tracking-widest text-center">
                  Unassigned Students
                </div>
                <div className="p-2 border-b border-slate-200">
                  <button
                    onClick={addAllRandomly}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-lg transition-colors text-xxs font-black uppercase tracking-wider"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add All Random
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                  {unassignedStudents.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 py-4 italic font-bold">
                      All assigned!
                    </div>
                  ) : (
                    unassignedStudents.map((student) => (
                      <div
                        key={student.id}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData('studentId', student.id)
                        }
                        onClick={() => handleStudentClick(student.id)}
                        className={`p-2 bg-white border ${selectedStudent === student.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'} rounded-lg shadow-sm text-xs font-black text-slate-700 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-all`}
                        title="Drag or Click to assign"
                      >
                        {student.label}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          data-no-drag="true"
          className="flex-1 relative bg-white overflow-hidden"
          onPointerDown={handleCanvasPointerDown}
          onClick={handleCanvasClick}
          style={{
            backgroundImage:
              mode === 'setup'
                ? 'radial-gradient(rgba(203, 213, 225, 0.4) 1px, transparent 1px)'
                : 'none',
            backgroundSize: `${gridSize}px ${gridSize}px`,
            cursor: mode === 'setup' ? 'crosshair' : 'default',
          }}
        >
          {/* Rubber-band selection rectangle */}
          {rbStyle && (
            <div
              className="absolute pointer-events-none z-20 border-2 border-indigo-500 bg-indigo-500/10 rounded"
              style={rbStyle}
            />
          )}

          {furniture.map((item) => {
            const dragPos = dragState?.get(item.id);
            const resizeSize =
              resizeState?.id === item.id ? resizeState : undefined;
            const assignedStudents =
              assignedStudentsByFurnitureId.get(item.id) ?? EMPTY_ARRAY;
            const isSelected = selectedIds.has(item.id) && mode === 'setup';
            const isSingleSelected = isSelected && selectedIds.size === 1;

            // Optimization: Memoized FurnitureItemRenderer prevents unnecessary re-renders of unchanged items
            // when only one item's position/size/state changes (e.g., during drag/resize operations).
            return (
              <FurnitureItemRenderer
                key={item.id}
                item={item}
                mode={mode}
                isSelected={isSelected}
                isSingleSelected={isSingleSelected}
                isHighlighted={randomHighlight === item.id}
                dragPos={dragPos}
                resizeSize={resizeSize}
                assignedStudents={assignedStudents}
                onPointerDown={handlePointerDown}
                onClick={handleFurnitureClick}
                onStudentDrop={handleStudentDrop}
                onResizeStart={handleResizeStart}
                onRotate={handleRotate}
                onDuplicate={duplicateFurniture}
                onRemove={removeFurniture}
                onRemoveAssignment={handleRemoveAssignment}
              />
            );
          })}

          {furniture.length === 0 && mode !== 'setup' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
              <LayoutGrid className="w-12 h-12 opacity-20 mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">
                Empty Classroom
              </p>
              <p className="text-xs">
                Switch to &quot;Setup&quot; to arrange furniture.
              </p>
            </div>
          )}

          {furniture.length === 0 && mode === 'setup' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
              <LayoutTemplate className="w-12 h-12 opacity-20 mb-2" />
              <p className="text-sm font-bold uppercase tracking-widest">
                No Furniture
              </p>
              <p className="text-xs">
                {template === 'freeform'
                  ? t('widgets.seatingChart.emptyStateFreeform')
                  : t('widgets.seatingChart.emptyStateTemplate')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
