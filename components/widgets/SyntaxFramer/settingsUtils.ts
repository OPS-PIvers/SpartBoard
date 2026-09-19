import type { SyntaxFramerConfig, SyntaxToken } from '@/types';

export const retokenizeSyntax = (
  text: string,
  mode: SyntaxFramerConfig['mode'],
  existingTokens: SyntaxToken[]
): SyntaxToken[] => {
  const values =
    mode === 'text'
      ? text.split(/\s+/).filter(Boolean)
      : text.split(/([+\-*/=()^]|\s+)/).filter((part) => part.trim() !== '');
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
