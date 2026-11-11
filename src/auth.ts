export function checkBearerToken(req: Request, expected: string): boolean {
  const header = req.headers.get('Authorization');
  if (!header) return false;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer') return false;
  return token === expected;
}
