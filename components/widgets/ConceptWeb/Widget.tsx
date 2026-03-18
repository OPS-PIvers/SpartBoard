import React, { useRef, useState, useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetComponentProps,
  ConceptWebConfig,
  ConceptNode,
  ConceptEdge,
} from '@/types';
import { Trash2 } from 'lucide-react';
import { getFontClass } from '@/utils/styles';

export const ConceptWebWidget: React.FC<WidgetComponentProps> = ({
  widget,
  isStudentView,
}) => {
  const { updateWidget, bringToFront, activeDashboard } = useDashboard();
  const config = widget.config as ConceptWebConfig;
  const nodes = useMemo(() => config.nodes ?? [], [config.nodes]);
  const edges = useMemo(() => config.edges ?? [], [config.edges]);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- LOCAL DRAG STATE (Nodes) ---
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeNodePos, setActiveNodePos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // --- LOCAL RESIZE STATE ---
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [resizingNodeDim, setResizingNodeDim] = useState<{
    w: number;
    h: number;
  } | null>(null);

  // --- LOCAL DRAW LINE STATE (Edges) ---
  const [drawingFromId, setDrawingFromId] = useState<string | null>(null);
  const [drawingLineEnd, setDrawingLineEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Default dimensions
  const DEFAULT_WIDTH = config.defaultNodeWidth ?? 15;
  const DEFAULT_HEIGHT = config.defaultNodeHeight ?? 15;

  const handleAddNode = () => {
    if (isStudentView) return;

    // Add some random offset so they don't stack perfectly (in percentages)
    const offsetX = Math.random() * 5 - 2.5;
    const offsetY = Math.random() * 5 - 2.5;

    const newNode: ConceptNode = {
      id: crypto.randomUUID(),
      text: '',
      x: 50 - DEFAULT_WIDTH / 2 + offsetX,
      y: 50 - DEFAULT_HEIGHT / 2 + offsetY,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      bgColor: '#fdf0d5',
    };

    updateWidget(widget.id, {
      config: {
        ...config,
        nodes: [...nodes, newNode],
      },
    });
  };

  const handleNodeTextChange = (id: string, text: string) => {
    if (isStudentView) return;
    const updated = nodes.map((n) => (n.id === id ? { ...n, text } : n));
    updateWidget(widget.id, { config: { ...config, nodes: updated } });
  };

  const handleDeleteNode = (id: string) => {
    if (isStudentView) return;
    const remainingNodes = nodes.filter((n) => n.id !== id);
    const remainingEdges = edges.filter(
      (e) => e.sourceNodeId !== id && e.targetNodeId !== id
    );
    updateWidget(widget.id, {
      config: { ...config, nodes: remainingNodes, edges: remainingEdges },
    });
  };

  const handleDeleteEdge = (e: React.MouseEvent, id: string) => {
    if (isStudentView) return;
    e.stopPropagation();
    const remainingEdges = edges.filter((edge) => edge.id !== id);
    updateWidget(widget.id, {
      config: { ...config, edges: remainingEdges },
    });
  };

  // --- DRAG NODE HANDLERS ---
  const handleNodePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    node: ConceptNode
  ) => {
    if (isStudentView) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName.toLowerCase() === 'textarea' ||
      target.closest('button') ||
      target.closest('.handle') ||
      target.closest('.resize-handle')
    ) {
      return;
    }
    bringToFront(widget.id);
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActiveNodeId(node.id);
    setActiveNodePos({ x: node.x, y: node.y });
  };

  const handleNodePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      !activeNodeId ||
      isStudentView ||
      !activeNodePos ||
      !containerRef.current
    )
      return;
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const movementXPct = (e.movementX / rect.width) * 100;
    const movementYPct = (e.movementY / rect.height) * 100;

    setActiveNodePos((prev) =>
      prev ? { x: prev.x + movementXPct, y: prev.y + movementYPct } : null
    );
  };

  const handleNodePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeNodeId || isStudentView || !activeNodePos) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    const updated = nodes.map((n) =>
      n.id === activeNodeId
        ? { ...n, x: activeNodePos.x, y: activeNodePos.y }
        : n
    );
    updateWidget(widget.id, { config: { ...config, nodes: updated } });

    setActiveNodeId(null);
    setActiveNodePos(null);
  };

  // --- RESIZE HANDLERS ---
  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    node: ConceptNode
  ) => {
    if (isStudentView) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizingNodeId(node.id);
    setResizingNodeDim({
      w: node.width ?? DEFAULT_WIDTH,
      h: node.height ?? DEFAULT_HEIGHT,
    });
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!resizingNodeId || isStudentView || !containerRef.current) return;
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const movementXPct = (e.movementX / rect.width) * 100;
    const movementYPct = (e.movementY / rect.height) * 100;

    setResizingNodeDim((prev) =>
      prev
        ? {
            w: Math.max(5, prev.w + movementXPct),
            h: Math.max(5, prev.h + movementYPct),
          }
        : null
    );
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!resizingNodeId || isStudentView || !resizingNodeDim) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    const updated = nodes.map((n) =>
      n.id === resizingNodeId
        ? { ...n, width: resizingNodeDim.w, height: resizingNodeDim.h }
        : n
    );
    updateWidget(widget.id, { config: { ...config, nodes: updated } });

    setResizingNodeId(null);
    setResizingNodeDim(null);
  };

  // --- DRAW EDGE HANDLERS ---
  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    nodeId: string
  ) => {
    if (isStudentView) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawingFromId(nodeId);

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDrawingLineEnd({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    }
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drawingFromId || isStudentView) return;
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDrawingLineEnd({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    }
  };

  const handleHandlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!drawingFromId || isStudentView) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    // Hide the drawing elements temporarily to let elementFromPoint find the node beneath
    const svgElement = containerRef.current?.querySelector('svg');
    if (svgElement) svgElement.style.pointerEvents = 'none';

    // Also hide the active handle
    const activeHandle = e.target as HTMLElement;
    const oldDisplay = activeHandle.style.display;
    activeHandle.style.display = 'none';

    const droppedOn = document.elementFromPoint(e.clientX, e.clientY);
    const targetNodeElement = droppedOn?.closest(
      '[data-node-id]'
    ) as HTMLElement | null;

    if (svgElement) svgElement.style.pointerEvents = '';
    activeHandle.style.display = oldDisplay;

    if (targetNodeElement) {
      const targetNodeId = targetNodeElement.getAttribute('data-node-id');
      if (targetNodeId && targetNodeId !== drawingFromId) {
        const exists = edges.some(
          (edge) =>
            edge.sourceNodeId === drawingFromId &&
            edge.targetNodeId === targetNodeId
        );
        if (!exists) {
          const newEdge: ConceptEdge = {
            id: crypto.randomUUID(),
            sourceNodeId: drawingFromId,
            targetNodeId,
            lineStyle: 'solid',
          };
          updateWidget(widget.id, {
            config: { ...config, edges: [...edges, newEdge] },
          });
        }
      }
    }

    setDrawingFromId(null);
    setDrawingLineEnd(null);
  };

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      let node = n;
      if (n.id === activeNodeId && activeNodePos) {
        node = { ...node, x: activeNodePos.x, y: activeNodePos.y };
      }
      if (n.id === resizingNodeId && resizingNodeDim) {
        node = { ...node, width: resizingNodeDim.w, height: resizingNodeDim.h };
      }
      return node;
    });
  }, [nodes, activeNodeId, activeNodePos, resizingNodeId, resizingNodeDim]);

  const sourceDrawNode = useMemo(() => {
    if (!drawingFromId) return null;
    return displayNodes.find((n) => n.id === drawingFromId);
  }, [drawingFromId, displayNodes]);

  const globalStyle = activeDashboard?.globalStyle;
  const fontClassName = useMemo(
    () =>
      getFontClass(
        config.fontFamily ?? 'global',
        globalStyle?.fontFamily ?? 'sans'
      ),
    [config.fontFamily, globalStyle?.fontFamily]
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-slate-50 rounded-xl select-none ${fontClassName}`}
    >
      {!isStudentView && (
        <button
          className="absolute z-20 bg-white border border-slate-300 rounded shadow-sm font-medium text-slate-700 hover:bg-slate-50 pointer-events-auto"
          style={{
            top: 'min(8px, 2cqmin)',
            left: 'min(8px, 2cqmin)',
            padding: 'min(4px, 1cqmin) min(12px, 3cqmin)',
            fontSize: 'min(14px, 4cqmin)',
          }}
          onClick={handleAddNode}
        >
          + Add Node
        </button>
      )}

      <svg
        className="absolute inset-0 z-0 pointer-events-none w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id={`arrowhead-${widget.id}`}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const source = displayNodes.find((n) => n.id === edge.sourceNodeId);
          const target = displayNodes.find((n) => n.id === edge.targetNodeId);
          if (!source || !target) return null;

          const sourceW = source.width ?? DEFAULT_WIDTH;
          const sourceH = source.height ?? DEFAULT_HEIGHT;
          const targetW = target.width ?? DEFAULT_WIDTH;
          const targetH = target.height ?? DEFAULT_HEIGHT;

          const x1 = source.x + sourceW / 2;
          const y1 = source.y + sourceH / 2;
          const x2 = target.x + targetW / 2;
          const y2 = target.y + targetH / 2;

          return (
            <path
              key={edge.id}
              d={`M ${x1} ${y1} L ${x2} ${y2}`}
              stroke="#94a3b8"
              strokeWidth="0.5"
              strokeDasharray={edge.lineStyle === 'dashed' ? '5,5' : 'none'}
              markerEnd={`url(#arrowhead-${widget.id})`}
              className="pointer-events-auto cursor-pointer hover:stroke-rose-400 transition-colors"
              onClick={(e) => handleDeleteEdge(e, edge.id)}
            >
              {!isStudentView && <title>Click to delete edge</title>}
            </path>
          );
        })}

        {sourceDrawNode && drawingLineEnd && (
          <path
            d={`M ${sourceDrawNode.x + (sourceDrawNode.width ?? DEFAULT_WIDTH) / 2} ${sourceDrawNode.y + (sourceDrawNode.height ?? DEFAULT_HEIGHT) / 2} L ${drawingLineEnd.x} ${drawingLineEnd.y}`}
            stroke="#94a3b8"
            strokeWidth="0.5"
            strokeDasharray="5,5"
            markerEnd={`url(#arrowhead-${widget.id})`}
            className="opacity-50 pointer-events-none"
          />
        )}
      </svg>

      {displayNodes.map((node) => {
        const w = node.width ?? DEFAULT_WIDTH;
        const h = node.height ?? DEFAULT_HEIGHT;

        return (
          <div
            key={node.id}
            data-node-id={node.id}
            onPointerDown={(e) => handleNodePointerDown(e, node)}
            onPointerMove={handleNodePointerMove}
            onPointerUp={handleNodePointerUp}
            onPointerCancel={handleNodePointerUp}
            className="absolute z-10 flex flex-col items-center justify-center shadow-sm border border-slate-300 rounded-[1cqmin] cursor-grab active:cursor-grabbing p-[1cqmin] group"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: `${w}%`,
              height: `${h}%`,
              backgroundColor: node.bgColor,
              fontFamily: 'inherit',
              containerType: 'size',
            }}
          >
            <textarea
              className="w-full h-full text-center bg-transparent border-none resize-none focus:outline-none focus:ring-[0.2cqmin] focus:ring-slate-400 rounded-[0.5cqmin] p-[0.5cqmin] text-[15cqmin] font-medium text-slate-800 leading-tight"
              value={node.text}
              onChange={(e) => handleNodeTextChange(node.id, e.target.value)}
              placeholder="Idea..."
              readOnly={isStudentView}
            />

            {!isStudentView && (
              <>
                <button
                  type="button"
                  className="absolute bg-white border border-slate-200 text-rose-500 opacity-0 hover:bg-rose-50 hover:text-rose-600 transition-opacity focus:opacity-100 group-hover:opacity-100"
                  style={{
                    top: 'max(-4px, -1cqmin)',
                    right: 'max(-4px, -1cqmin)',
                    padding: 'min(4px, 1cqmin)',
                    borderRadius: '9999px',
                  }}
                  onClick={() => handleDeleteNode(node.id)}
                  title="Delete Node"
                  aria-label="Delete node"
                >
                  <Trash2
                    style={{
                      width: 'min(16px, 4cqmin)',
                      height: 'min(16px, 4cqmin)',
                    }}
                  />
                </button>

                <button
                  type="button"
                  className="handle absolute bg-white border border-slate-300 cursor-crosshair text-slate-400 hover:text-indigo-500 hover:border-indigo-400 transition-colors shadow-sm"
                  style={{
                    bottom: 'max(-4px, -1cqmin)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: 'min(4px, 1cqmin)',
                    borderRadius: '9999px',
                  }}
                  onPointerDown={(e) => handleHandlePointerDown(e, node.id)}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  title="Drag to connect"
                  aria-label="Drag to connect"
                >
                  <div
                    className="rounded-full bg-current pointer-events-none"
                    style={{
                      width: 'min(8px, 2cqmin)',
                      height: 'min(8px, 2cqmin)',
                    }}
                  />
                </button>

                <div
                  className="resize-handle absolute bottom-0 right-0 cursor-nwse-resize text-slate-300 hover:text-indigo-500 transition-colors"
                  style={{
                    padding: 'min(4px, 1cqmin)',
                  }}
                  onPointerDown={(e) => handleResizePointerDown(e, node)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerUp}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                      width: 'min(12px, 3cqmin)',
                      height: 'min(12px, 3cqmin)',
                    }}
                  >
                    <line x1="22" y1="12" x2="12" y2="22" />
                    <line x1="22" y1="18" x2="18" y2="22" />
                  </svg>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
