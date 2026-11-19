/** One node of a dictated passage as it sits in the editor. */
export type DictatedPiece = { node: Text; text: string } | { node: Element };

/** A dictated passage: its text as committed and the nodes that hold it. */
export interface DictatedPassage {
  text: string;
  pieces: DictatedPiece[];
}

/** Text nodes and line breaks for `text`, one text node per line. */
export function buildDictatedPassage(
  doc: Document,
  text: string
): DictatedPassage {
  const pieces: DictatedPiece[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) pieces.push({ node: doc.createElement('br') });
    if (line) pieces.push({ node: doc.createTextNode(line), text: line });
  });
  return { text, pieces };
}

/** True while every node of the passage is still in the box with its words unedited. */
export function passageIntact(root: Node, passage: DictatedPassage): boolean {
  return (
    passage.pieces.length > 0 &&
    passage.pieces.every(
      (p) =>
        root.contains(p.node) &&
        (!('text' in p) || p.node.data.includes(p.text))
    )
  );
}

function boundary(piece: DictatedPiece, end: boolean): Range {
  const range = piece.node.ownerDocument.createRange();
  if ('text' in piece) {
    const at = piece.node.data.lastIndexOf(piece.text);
    range.setStart(piece.node, end ? at + piece.text.length : at);
  } else if (end) range.setStartAfter(piece.node);
  else range.setStartBefore(piece.node);
  range.collapse(true);
  return range;
}

const samePoint = (a: Range, b: Range): boolean =>
  a.startContainer === b.startContainer && a.startOffset === b.startOffset;

/** True when `caret` sits right after the last piece, so it should follow a replacement. */
export function caretEndsPassage(
  caret: Range | null,
  pieces: readonly DictatedPiece[]
): boolean {
  const last = pieces[pieces.length - 1];
  if (!caret || !last || !caret.collapsed) return false;
  if (samePoint(caret, boundary(last, true))) return true;
  const after = last.node.ownerDocument.createRange();
  after.setStartAfter(last.node);
  if (!samePoint(caret, after)) return false;
  return !('text' in last) || last.node.data.endsWith(last.text);
}

/** Takes the pieces out and returns the spot where they began. */
export function removePieces(pieces: readonly DictatedPiece[]): Range {
  const start = boundary(pieces[0], false);
  for (const p of pieces) {
    if ('text' in p) {
      const at = p.node.data.lastIndexOf(p.text);
      p.node.deleteData(at, p.text.length);
    } else {
      p.node.remove();
    }
  }
  start.collapse(true);
  return start;
}

/** Swaps the pieces for `next` in place; returns the spot right after the new text. */
export function replacePieces(
  pieces: readonly DictatedPiece[],
  next: DictatedPassage
): Range {
  const spot = removePieces(pieces);
  const doc = pieces[0].node.ownerDocument;
  const fragment = doc.createDocumentFragment();
  fragment.append(...next.pieces.map((p) => p.node));
  spot.insertNode(fragment);
  const after = doc.createRange();
  const last = next.pieces[next.pieces.length - 1];
  if (last) after.setStartAfter(last.node);
  else after.setStart(spot.startContainer, spot.startOffset);
  after.collapse(true);
  return after;
}

function adjacent(a: DictatedPassage, b: DictatedPassage): boolean {
  const last = a.pieces[a.pieces.length - 1];
  const first = b.pieces[0];
  if (last.node.nextSibling !== first.node) return false;
  if ('text' in last && !last.node.data.endsWith(last.text)) return false;
  return !('text' in first) || first.node.data.startsWith(first.text);
}

/** The newest dictated passage plus the intact ones that run straight into it, oldest first. */
export function latestDictatedRun(
  root: Node,
  passages: readonly DictatedPassage[],
  maxChars: number
): DictatedPassage[] {
  const run: DictatedPassage[] = [];
  let chars = 0;
  for (let i = passages.length - 1; i >= 0; i--) {
    const passage = passages[i];
    if (!passageIntact(root, passage)) break;
    if (run.length > 0 && !adjacent(passage, run[0])) break;
    if (chars + passage.text.length > maxChars) break;
    chars += passage.text.length;
    run.unshift(passage);
  }
  return run;
}
