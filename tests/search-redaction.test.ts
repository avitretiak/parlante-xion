import { describe, expect, mock, test } from 'bun:test';
import type { Kazagumo } from 'kazagumo';

const debugMock = mock(() => {});
const warnMock = mock(() => {});

// Static import cannot work here: mock.module must be registered BEFORE the
// module under test is imported, so search.ts sees the mocked logger.
mock.module('../src/utils/system/logger', () => ({
  debug: debugMock,
  warn: warnMock,
}));

const { describeQueryForLogs, searchTracks } = await import('../src/services/search');

describe('searchTracks log redaction', () => {
  test('success diagnostics never include the raw query', async () => {
    const query = 'https://www.youtube.com/watch?v=abc123&list=PL456&si=secret-token';
    const kazagumo = {
      search: mock(() => Promise.resolve({ type: 'SEARCH', tracks: [] })),
    } as unknown as Kazagumo;

    await searchTracks(kazagumo, query, 'user-1');

    expect(debugMock).toHaveBeenCalled();
    const [message, properties] = debugMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('searchTracks success');
    expect(JSON.stringify(properties)).not.toContain(query);
    expect(properties.queryLength).toBe(query.length);
    // No recoverable fingerprint: a stable hash would let an offline attacker
    // match candidate queries by length + digest.
    expect(properties.queryHash).toBeUndefined();
    expect(JSON.stringify(properties)).not.toContain('queryHash');
    expect(properties.sourceHost).toBe('www.youtube.com');
  });

  test('failure diagnostics never include the raw query', async () => {
    const query = 'supersecret phrase';
    const kazagumo = {
      search: mock(() => Promise.reject(new Error('Network timeout'))),
    } as unknown as Kazagumo;

    await searchTracks(kazagumo, query).catch(() => {});

    expect(warnMock).toHaveBeenCalled();
    const [message, properties] = warnMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain('searchTracks failed');
    expect(JSON.stringify(properties)).not.toContain(query);
    expect(properties.queryLength).toBe(query.length);
    expect(properties.queryHash).toBeUndefined();
    expect(JSON.stringify(properties)).not.toContain('queryHash');
    expect(properties.sourceHost).toBeNull();
  });
});

describe('describeQueryForLogs', () => {
  test('reports a host only for URL queries', () => {
    expect(describeQueryForLogs('just words').sourceHost).toBeNull();
    expect(describeQueryForLogs('https://soundcloud.com/artist/track').sourceHost).toBe(
      'soundcloud.com',
    );
  });

  test('never exposes URL credentials', () => {
    const properties = describeQueryForLogs('https://user:hunter2@example.com/track');
    expect(properties.sourceHost).toBe('example.com');
    expect(JSON.stringify(properties)).not.toContain('hunter2');
    expect(JSON.stringify(properties)).not.toContain('user@');
  });
});
