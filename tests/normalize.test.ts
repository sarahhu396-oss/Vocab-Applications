import { describe, it, expect } from 'vitest';
import { normalizeTerm } from '../src/normalize';

describe('normalizeTerm', () => {
  it('lowercases the input', () => {
    expect(normalizeTerm('Perspicacious')).toBe('perspicacious');
  });

  it('trims whitespace', () => {
    expect(normalizeTerm('  perspicacious  ')).toBe('perspicacious');
  });

  it('strips leading and trailing punctuation', () => {
    expect(normalizeTerm('"perspicacious."')).toBe('perspicacious');
    expect(normalizeTerm('(rapacious),')).toBe('rapacious');
  });

  it('preserves internal punctuation in phrases', () => {
    expect(normalizeTerm('burning the midnight oil')).toBe('burning the midnight oil');
    expect(normalizeTerm("can't")).toBe("can't");
  });

  it('returns empty string for input that is only punctuation', () => {
    expect(normalizeTerm('...')).toBe('');
  });

  it('handles unicode characters', () => {
    expect(normalizeTerm('Naïve')).toBe('naïve');
  });
});
