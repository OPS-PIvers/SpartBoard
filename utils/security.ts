import DOMPurify from 'dompurify';

/**
 * Robust HTML sanitizer to prevent XSS.
 * Uses DOMPurify to remove dangerous tags and attributes.
 *
 * This profile is the legacy TextWidget profile — it allows `<font>`,
 * `<span>`, `<div>`, `<img>`, `<a>` and inline `style`/`color`
 * attributes so the rich-text TextWidget can paste styled content. Do
 * NOT use this for student-authored content where styling can leak
 * teacher intent or where the document size matters (essay responses).
 * Use `sanitizeQuizResponse` instead for student-written quiz answers.
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    // Whitelist tags that are necessary for the TextWidget and general formatting
    ALLOWED_TAGS: [
      'b',
      'strong',
      'i',
      'em',
      'u',
      'strike',
      'ul',
      'ol',
      'li',
      'font',
      'span',
      'div',
      'p',
      'a',
      'br',
      'img',
    ],
    // Whitelist attributes needed for formatting and functionality
    ALLOWED_ATTR: [
      'href',
      'style',
      'color',
      'size',
      'target',
      'src',
      'class',
      'align',
      'title',
    ],
    // Allow data:image/ URIs for images
    ADD_DATA_URI_TAGS: ['img'],
    // ALLOWED_URI_REGEXP intentionally omitted: DOMPurify's built-in default
    // already restricts dangerous protocols and is kept up to date upstream.
  });
};

/**
 * Stricter sanitizer for student-authored quiz responses.
 *
 * `WrittenResponseEditor` uses `document.execCommand` (the only path
 * Phase 1 chose to avoid pulling TipTap into the bundle), and browsers
 * inject inconsistent wrappers — e.g. Safari/older Chromium can emit
 * `<font color="red">` or `<span style="font-weight:bold">` when the
 * user toggles bold, and a determined student could programmatically
 * insert styled HTML via the contenteditable surface.
 *
 * This profile strips ALL formatting wrappers (`font`, `span`, `div`,
 * `style`, `color`, `class`, etc.) and keeps only the small set of
 * semantic tags needed for legitimate essay formatting: bold, italic,
 * underline, line/paragraph breaks, and lists. The teacher's grader
 * uses the same profile when rendering the response so a stale
 * pre-sanitization payload from an older client also can't leak styled
 * content into the teacher's view.
 *
 * Links (`<a>`), images, and external URIs are intentionally absent —
 * Phase 1 student responses are plain prose, not publishable
 * documents.
 */
export const sanitizeQuizResponse = (html: string): string => {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li'],
    // No `style`, `color`, `class`, `href`, `src` — formatting comes
    // only from the semantic tags above.
    ALLOWED_ATTR: [],
  });
};
