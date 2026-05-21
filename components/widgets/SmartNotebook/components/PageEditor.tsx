import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  prepareEditableSvg,
  ensureObjectIds,
  objectIdForTarget,
  findObjectById,
  EditableObjectInfo,
} from '@/utils/notebookSvgEdit';

interface PageEditorProps {
  /** Raw page SVG text (from a parsed notebook page). */
  svg: string;
  className?: string;
  /** Notifies the host which object is selected (id + kind), or null. */
  onSelectionChange?: (selection: EditableObjectInfo | null) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG-native page editor (Tier 2, phase 1). Inlines a sanitized page SVG and
 * lets the teacher click to select a top-level object (text / image / ink),
 * showing a bounding-box highlight drawn in the SVG's own coordinate space (so
 * it scales perfectly). Move / delete / text-edit build on this.
 */
export const PageEditor: React.FC<PageEditorProps> = ({
  svg,
  className,
  onSelectionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const highlightRef = useRef<SVGRectElement | null>(null);
  const objectsRef = useRef<EditableObjectInfo[]>([]);
  // Keep the latest callback in a ref so the notify effect needn't depend on it.
  const onSelRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelRef.current = onSelectionChange;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const prepared = useMemo(() => prepareEditableSvg(svg), [svg]);

  // Reset the selection when the page changes (adjust-state-while-rendering
  // pattern — avoids a state-setting effect).
  const [prevPrepared, setPrevPrepared] = useState(prepared);
  if (prepared !== prevPrepared) {
    setPrevPrepared(prepared);
    setSelectedId(null);
  }

  // Position (or hide) the in-SVG highlight rect for a given object. Pure DOM.
  const positionHighlight = useCallback((id: string | null) => {
    const svgEl = svgRef.current;
    const rect = highlightRef.current;
    if (!svgEl || !rect) return;
    const obj = id ? findObjectById(svgEl, id) : null;
    if (!obj) {
      rect.style.display = 'none';
      return;
    }
    const bbox = obj.getBBox();
    rect.setAttribute('x', String(bbox.x));
    rect.setAttribute('y', String(bbox.y));
    rect.setAttribute('width', String(bbox.width));
    rect.setAttribute('height', String(bbox.height));
    rect.style.display = '';
  }, []);

  // Inline the sanitized, responsive SVG and tag its objects. DOM-only — no
  // setState here. A highlight rect is appended in the SVG's coordinate space.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = prepared;
    const el = container.querySelector('svg');
    svgRef.current = el;
    if (!el) {
      highlightRef.current = null;
      objectsRef.current = [];
      return;
    }
    objectsRef.current = ensureObjectIds(el);
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('fill', 'rgba(99,102,241,0.12)');
    rect.setAttribute('stroke', '#6366f1');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    rect.setAttribute('pointer-events', 'none');
    rect.style.display = 'none';
    el.appendChild(rect);
    highlightRef.current = rect;
  }, [prepared]);

  // React to selection changes: reposition the highlight and notify the host.
  // No setState here, so this is not a state-setting effect.
  useEffect(() => {
    positionHighlight(selectedId);
    const info = selectedId
      ? (objectsRef.current.find((o) => o.id === selectedId) ?? null)
      : null;
    onSelRef.current?.(info);
  }, [selectedId, positionHighlight, prepared]);

  // Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setSelectedId(objectIdForTarget(svgEl, e.target as Element));
  };

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleClick}
        role="presentation"
      />
    </div>
  );
};

export default PageEditor;
