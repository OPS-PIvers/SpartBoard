import type { SyntaxFramerConfig, SyntaxToken } from '@/types';

const syntaxValues = (
  text: string,
  mode: SyntaxFramerConfig['mode']
): string[] =>
  mode === 'text'
    ? text.split(/\s+/).filter(Boolean)
    : text.split(/([+\-*/=()^]|\s+)/).filter((part) => part.trim() !== '');

export const normalizeSyntaxText = (
  text: string,
  mode: SyntaxFramerConfig['mode']
): string => syntaxValues(text, mode).join(mode === 'text' ? ' ' : '');

export const syntaxTokensToText = (
  tokens: SyntaxToken[],
  mode: SyntaxFramerConfig['mode']
): string =>
  tokens.map((token) => token.value).join(mode === 'text' ? ' ' : '');

export const retokenizeSyntax = (
  text: string,
  mode: SyntaxFramerConfig['mode'],
  existingTokens: SyntaxToken[]
): SyntaxToken[] => {
  const values = syntaxValues(text, mode);
  const usedExistingTokenIds = new Set<string>();

  return values.map((value) => {
    const newToken: SyntaxToken = {
      id: crypto.randomUUID(),
      value,
      isMasked: false,
    };
    const existingToken = existingTokens.find(
      (token) => token.value === value && !usedExistingTokenIds.has(token.id)
    );
    if (!existingToken) return newToken;
    usedExistingTokenIds.add(existingToken.id);
    return {
      ...newToken,
      id: existingToken.id,
      color: existingToken.color,
      isMasked: existingToken.isMasked,
    };
  });
};
