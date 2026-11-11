export function normalizeTerm(raw: string): string {
  const lowered = raw.toLowerCase().trim();
  return lowered.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '');
}
