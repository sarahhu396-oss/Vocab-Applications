import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../src/parseTranscript';

describe('parseTranscript', () => {
  it('parses a Word + Context transcript', () => {
    const result = parseTranscript(
      'Word, perspicacious. Context, Her perspicacious analysis cut through the noise.'
    );
    expect(result.term).toBe('perspicacious');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe('Her perspicacious analysis cut through the noise.');
    expect(result.markers_found).toBe(true);
  });

  it('parses a Phrase + Context transcript', () => {
    const result = parseTranscript(
      'Phrase, burning the midnight oil. Context, He has been burning the midnight oil all week.'
    );
    expect(result.term).toBe('burning the midnight oil');
    expect(result.term_type).toBe('phrase');
    expect(result.context).toBe('He has been burning the midnight oil all week.');
    expect(result.markers_found).toBe(true);
  });

  it('is case-insensitive for markers', () => {
    const result = parseTranscript('word, ephemeral. context, the moment was ephemeral.');
    expect(result.term).toBe('ephemeral');
    expect(result.context).toBe('the moment was ephemeral.');
    expect(result.markers_found).toBe(true);
  });

  it('ignores later occurrences of marker tokens inside the context', () => {
    const result = parseTranscript(
      'Word, context. Context, You need to read it in context to understand the word.'
    );
    expect(result.term).toBe('context');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe(
      'You need to read it in context to understand the word.'
    );
  });

  it('returns markers_found false when no markers present', () => {
    const result = parseTranscript('just a free-form sentence with no markers');
    expect(result.markers_found).toBe(false);
    expect(result.term).toBe('');
    expect(result.context).toBe('');
    expect(result.term_type).toBe(null);
  });

  it('handles Word marker without Context marker (empty context)', () => {
    const result = parseTranscript('Word, perspicacious.');
    expect(result.term).toBe('perspicacious');
    expect(result.term_type).toBe('word');
    expect(result.context).toBe('');
    expect(result.markers_found).toBe(true);
  });

  it('tolerates pauses transcribed as periods between markers', () => {
    const result = parseTranscript(
      'Word. perspicacious. Context. Her analysis was perspicacious.'
    );
    expect(result.term).toBe('perspicacious');
    expect(result.context).toBe('Her analysis was perspicacious.');
  });
});
