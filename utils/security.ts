import DOMPurify from 'dompurify';

/**
 * Robust HTML sanitizer to prevent XSS.
 * Uses DOMPurify to remove dangerous tags and attributes.
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
    // Ensure links don't have dangerous protocols
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
};
