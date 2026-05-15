/**
 * Custom list-toggle implementation for contenteditable editors.
 *
 * Replaces `document.execCommand('insertUnorderedList' | 'insertOrderedList')`,
 * which has long-standing Chrome bugs when the selection spans multiple
 * block-level elements:
 *
 *  - The command often only converts the cursor's current paragraph to
 *    a list item, leaving sibling blocks as bare paragraphs.
 *  - Inline formatting around the selection (bold, italic) can be
 *    dropped or duplicated in unpredictable ways.
 *  - Toggling off a list with a mixed selection sometimes splits the
 *    list into two halves with the middle items orphaned.
 *
 * This module operates on the DOM directly:
 *
 *   `toggleList(editor, 'ul')` walks the editor's top-level children,
 *   picks every block (paragraph or existing `<li>`) the selection
 *   overlaps, and either:
 *     - **wraps** them all into a single new `<ul>`/`<ol>` (each block
 *       becomes an `<li>`), OR
 *     - **unwraps** them back to paragraphs of the configured tag if
 *       every selected block is already an `<li>` of the target type.
 *
 * Selection is preserved across the mutation by saving and restoring
 * the start/end positions as character offsets into the editor's plain
 * text (text content doesn't change, only block structure does).
 */

/**
 * Toggle a list wrapper around the blocks the current selection touches.
 *
 * @param editor — the contenteditable element
 * @param listTag — `'ul'` for bulleted, `'ol'` for numbered
 * @param paragraphTag — the tag used when unwrapping list items back
 *   to paragraphs. `'p'` for WrittenResponseEditor (its sanitizer
 *   strips `<div>`), `'div'` for TextWidget.
 */
export const toggleList = (
  editor: HTMLElement,
  listTag: 'ul' | 'ol',
  paragraphTag: 'p' | 'div' = 'p'
): void => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  // Capture selection as character offsets BEFORE we touch the DOM.
  // Text content doesn't change during a list toggle (only block
  // structure does), so the same offsets resolve to the same caret
  // positions after the mutation.
  const savedOffsets = saveSelectionOffsets(editor, range);

  const blocks = collectSelectedBlocks(editor, range);
  if (blocks.length === 0) return;

  const listTagUpper = listTag.toUpperCase();
  const allInTargetList = blocks.every(
    (b) =>
      b.tagName === 'LI' &&
      b.parentElement !== null &&
      b.parentElement.tagName === listTagUpper
  );

  if (allInTargetList) {
    unwrapBlocksToParagraphs(blocks, paragraphTag);
  } else {
    wrapBlocksIntoList(editor, blocks, listTag);
  }

  restoreSelectionOffsets(editor, savedOffsets);
};

/**
 * Walk the editor's direct children. For each child that overlaps the
 * range, either add it directly (paragraph blocks) or drill into it
 * (`<ul>` / `<ol>` containers expose their `<li>` children as the
 * selectable units). Returns the blocks in document order.
 */
const collectSelectedBlocks = (
  editor: HTMLElement,
  range: Range
): HTMLElement[] => {
  const result: HTMLElement[] = [];
  for (const child of Array.from(editor.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (!rangeIntersectsNode(range, child)) continue;
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      for (const li of Array.from(child.children)) {
        if (
          li instanceof HTMLElement &&
          li.tagName === 'LI' &&
          rangeIntersectsNode(range, li)
        ) {
          result.push(li);
        }
      }
    } else {
      result.push(child);
    }
  }
  return result;
};

/** True when `range` and `node` share any common content. Includes
 *  ranges that touch the node's boundary on either side. */
const rangeIntersectsNode = (range: Range, node: Node): boolean => {
  const nodeRange = document.createRange();
  nodeRange.selectNode(node);
  // `intersectsNode` would be perfect but isn't in older Edge / Safari.
  // Compare-boundary-points covers every browser we ship to.
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0
  );
};

/**
 * Replace each selected paragraph/li with an `<li>` and group them
 * under a single new `<ul>`/`<ol>` inserted where the first selected
 * block was. Children of each block are moved (never cloned) so live
 * Range references — including the user's caret — survive per the DOM
 * spec.
 *
 * Edge cases handled:
 *  - If an `<li>` is selected and its parent list has unselected
 *    siblings, the parent list is split or the `<li>` is migrated.
 *  - Empty leftover lists are removed.
 *  - Selected `<li>`s from the same list have their original list
 *    cleaned up after extraction.
 */
const wrapBlocksIntoList = (
  editor: HTMLElement,
  blocks: HTMLElement[],
  listTag: 'ul' | 'ol'
): void => {
  const firstBlock = blocks[0];
  if (!firstBlock.parentNode) return;

  // Find the editor-level ancestor of `firstBlock` — its top-level
  // "address" inside the editor. The new list will be inserted before
  // this anchor on the editor. For a paragraph block at top level
  // `anchor === firstBlock`; for an `<li>` selected from inside a
  // `<ul>` `anchor === <ul>`. Inserting via `editor.insertBefore` is
  // critical: if we instead used `firstBlock.parentNode.insertBefore`,
  // a selected `<li>` would nest the new list inside its own old list.
  let anchor: Node = firstBlock;
  while (anchor.parentNode && anchor.parentNode !== editor) {
    anchor = anchor.parentNode;
  }
  // If the walk left the editor (shouldn't happen given the caller's
  // preconditions) we have nothing safe to anchor against.
  if (anchor.parentNode !== editor) return;

  const newList = document.createElement(listTag);
  const sourceLists = new Set<HTMLElement>();

  for (const block of blocks) {
    const li = document.createElement('li');
    while (block.firstChild) li.appendChild(block.firstChild);
    newList.appendChild(li);
    if (
      block.tagName === 'LI' &&
      block.parentElement &&
      (block.parentElement.tagName === 'UL' ||
        block.parentElement.tagName === 'OL')
    ) {
      sourceLists.add(block.parentElement);
    }
  }

  editor.insertBefore(newList, anchor);

  // Remove the now-emptied original blocks (their children moved into
  // the new list's <li>s). For <li>s, also remove their parent list if
  // it's now empty.
  for (const block of blocks) {
    if (block.parentNode) block.parentNode.removeChild(block);
  }
  for (const list of sourceLists) {
    if (list.children.length === 0 && list.parentNode) {
      list.parentNode.removeChild(list);
    }
  }
};

/**
 * Replace each `<li>` in `blocks` with a paragraph of `paragraphTag`,
 * inserting the paragraphs where the original list was. Removes the
 * empty list when all its items have been unwrapped.
 *
 * Each `<li>`'s children are moved into the new paragraph (never
 * cloned) so any live Range references the caller is tracking — the
 * user's caret, an active selection — survive per the DOM spec.
 */
const unwrapBlocksToParagraphs = (
  blocks: HTMLElement[],
  paragraphTag: 'p' | 'div'
): void => {
  // Group by parent list so we can splice each list in one pass.
  const byList = new Map<HTMLElement, HTMLElement[]>();
  for (const li of blocks) {
    const list = li.parentElement;
    if (!list || (list.tagName !== 'UL' && list.tagName !== 'OL')) continue;
    const existing = byList.get(list);
    if (existing) {
      existing.push(li);
    } else {
      byList.set(list, [li]);
    }
  }

  for (const [list, lis] of byList) {
    const listParent = list.parentNode;
    if (!listParent) continue;
    for (const li of lis) {
      const p = document.createElement(paragraphTag);
      while (li.firstChild) p.appendChild(li.firstChild);
      listParent.insertBefore(p, list);
      list.removeChild(li);
    }
    if (list.children.length === 0) {
      listParent.removeChild(list);
    }
  }
};

// ─── Selection persistence ──────────────────────────────────────────

interface SavedOffsets {
  start: number;
  end: number;
}

/**
 * Save the start/end of a Range as character offsets into the
 * editor's plain text. Text content is invariant across list-toggle
 * mutations (only block structure changes), so these offsets resolve
 * to the same caret positions after the mutation.
 */
const saveSelectionOffsets = (
  editor: HTMLElement,
  range: Range
): SavedOffsets => ({
  start: textOffsetOf(editor, range.startContainer, range.startOffset),
  end: textOffsetOf(editor, range.endContainer, range.endOffset),
});

/**
 * Compute the character offset of `(container, offset)` within
 * `editor`'s flattened text content. Uses a Range with a known
 * start (editor's content start) and the given end-point so
 * `toString()` returns the prefix text whose length is the offset.
 */
const textOffsetOf = (
  editor: HTMLElement,
  container: Node,
  offset: number
): number => {
  if (!editor.contains(container)) return 0;
  const probe = document.createRange();
  probe.selectNodeContents(editor);
  try {
    probe.setEnd(container, offset);
  } catch {
    // Container/offset may be invalid after a partial mutation. Fall
    // back to placing the caret at the editor start.
    return 0;
  }
  return probe.toString().length;
};

/**
 * Restore the selection from saved character offsets by walking text
 * nodes until we accumulate the target offset, then setting a range
 * at that position.
 */
const restoreSelectionOffsets = (
  editor: HTMLElement,
  offsets: SavedOffsets
): void => {
  const sel = window.getSelection();
  if (!sel) return;
  const startPos = positionAtOffset(editor, offsets.start);
  const endPos = positionAtOffset(editor, offsets.end);
  if (!startPos || !endPos) return;
  const range = document.createRange();
  try {
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
  } catch {
    return;
  }
  sel.removeAllRanges();
  sel.addRange(range);
};

const positionAtOffset = (
  editor: HTMLElement,
  targetOffset: number
): { node: Node; offset: number } | null => {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let count = 0;
  let lastText: Text | null = null;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.nodeValue?.length ?? 0;
    if (count + len >= targetOffset) {
      return { node, offset: targetOffset - count };
    }
    count += len;
    lastText = node;
    node = walker.nextNode() as Text | null;
  }
  // Overshoot: clamp to the end of the last text node we saw.
  if (lastText) {
    return { node: lastText, offset: lastText.nodeValue?.length ?? 0 };
  }
  return null;
};
