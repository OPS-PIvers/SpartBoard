// Splits an array into fixed-size chunks (the last may be short) to bound `in` queries and HTTP fan-outs.
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
