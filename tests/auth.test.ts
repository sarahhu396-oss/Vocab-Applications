import { describe, it, expect } from 'vitest';
import { checkBearerToken } from '../src/auth';

describe('checkBearerToken', () => {
  it('returns true when Authorization header matches expected token', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer abc123' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(true);
  });

  it('returns false when token does not match', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });

  it('returns false when Authorization header is missing', () => {
    const req = new Request('https://x');
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });

  it('returns false when scheme is not Bearer', () => {
    const req = new Request('https://x', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(checkBearerToken(req, 'abc123')).toBe(false);
  });
});
