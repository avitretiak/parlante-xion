import { describe, expect, test } from 'bun:test';
import { escapeDiscordMarkdown } from '../src/utils/general/string';

describe('escapeDiscordMarkdown', () => {
  test('escapes formatting characters', () => {
    expect(escapeDiscordMarkdown('**bold** _it_ `code` ~~strike~~ |')).toBe(
      '\\*\\*bold\\*\\* \\_it\\_ \\`code\\` \\~\\~strike\\~\\~ \\|',
    );
  });

  test('neutralizes mention-like payloads in externally supplied text', () => {
    expect(escapeDiscordMarkdown('<@123456789012345678>')).toBe('\\<@123456789012345678\\>');
    expect(escapeDiscordMarkdown('<#123456789012345678>')).toBe('\\<\\#123456789012345678\\>');
  });

  test('neutralizes link breakout in title text', () => {
    expect(escapeDiscordMarkdown('[click](https://evil.example)')).toBe(
      '\\[click\\]\\(https://evil.example\\)',
    );
  });

  test('preserves plain text and escapes backslashes', () => {
    expect(escapeDiscordMarkdown('Rick Astley - Never Gonna Give You Up')).toBe(
      'Rick Astley - Never Gonna Give You Up',
    );
    expect(escapeDiscordMarkdown('a\\b')).toBe('a\\\\b');
  });
});
