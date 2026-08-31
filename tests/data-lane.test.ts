import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { favoriteQuery, setting } from '../src/db/schema';
import en from '../src/languages/en';
import esUY from '../src/languages/es-UY';

// Point the db singleton at an in-memory database BEFORE any module that
// imports `#parlante/db` is loaded, then run the real migrations.
process.env.DATABASE_URL = 'file::memory:';

const { db } = await import('../src/db');
const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
const { getGuildSettings } = await import('../src/utils/config/get-guild-settings');
const {
  createFavorite,
  favoriteListValue,
  normalizeFavoriteName,
  normalizeFavoriteQuery,
  FAVORITE_MAX_LENGTH,
  FAVORITE_QUERY_MAX_LENGTH,
} = await import('../src/services/favorites-service');

await migrate(db, { migrationsFolder: './drizzle' });

describe('favorite input normalization', () => {
  test('trims names and queries', () => {
    expect(normalizeFavoriteName('  my jam  ')).toBe('my jam');
    expect(normalizeFavoriteQuery('  ytsearch: song  ')).toBe('ytsearch: song');
  });

  test('rejects empty and whitespace-only input', () => {
    expect(normalizeFavoriteName('')).toBeNull();
    expect(normalizeFavoriteName('   ')).toBeNull();
    expect(normalizeFavoriteQuery('')).toBeNull();
    expect(normalizeFavoriteQuery('\t\n')).toBeNull();
  });

  test('names stay at 100 while queries get the 6000 string-option limit', () => {
    expect(FAVORITE_MAX_LENGTH).toBe(100);
    expect(FAVORITE_QUERY_MAX_LENGTH).toBe(6000);
    expect(normalizeFavoriteName('x'.repeat(100))).toBe('x'.repeat(100));
    expect(normalizeFavoriteName('x'.repeat(101))).toBeNull();
    // Queries may exceed the choice/name limit: valid signed media and
    // playlist URLs are routinely longer than 100 characters.
    expect(normalizeFavoriteQuery('q'.repeat(100))).toBe('q'.repeat(100));
    expect(normalizeFavoriteQuery('q'.repeat(101))).toBe('q'.repeat(101));
    expect(normalizeFavoriteQuery('q'.repeat(6000))).toBe('q'.repeat(6000));
    expect(normalizeFavoriteQuery('q'.repeat(6001))).toBeNull();
    expect(normalizeFavoriteQuery(`  ${'q'.repeat(6000)}  `)).toBe('q'.repeat(6000));
  });
});

describe('favorite list rendering', () => {
  test('long valid query URL is stored and plays back unchanged', async () => {
    const longUrl = `https://cdn.example.com/media/${'a'.repeat(200)}.mp3`;
    expect(longUrl.length).toBeGreaterThan(100);

    const created = await createFavorite({
      guildId: 'guild-long-url',
      authorId: 'user-1',
      name: 'long',
      query: longUrl,
    });
    expect(created?.query).toBe(longUrl);

    const stored = await db
      .select()
      .from(favoriteQuery)
      .where(eq(favoriteQuery.guildId, 'guild-long-url'));
    expect(stored[0]?.query).toBe(longUrl);
  });

  test('list value stays within the 1024-character field limit', () => {
    const value = favoriteListValue(
      `[x](https://evil.invalid) ${'q'.repeat(6000)}`,
      '123456789012345678',
    );
    expect(value.length).toBeLessThanOrEqual(1024);
    expect(value.endsWith(' (<@123456789012345678>)')).toBe(true);
    expect(value).toContain('...');
  });

  test('list value escapes attacker markdown but keeps the mention', () => {
    expect(favoriteListValue('[Official](https://evil.invalid)', '123456789012345678')).toBe(
      '\\[Official\\]\\(https://evil.invalid\\) (<@123456789012345678>)',
    );
  });
});

describe('createFavorite conflict handling', () => {
  test('concurrent duplicate creates yield exactly one row and one success', async () => {
    const guildId = 'guild-dup';
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        createFavorite({ guildId, authorId: 'user-1', name: 'dupe', query: 'some song' }),
      ),
    );

    const created = attempts.filter((row) => row !== null);
    expect(created).toHaveLength(1);

    const rows = await db.select().from(favoriteQuery).where(eq(favoriteQuery.guildId, guildId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('dupe');
  });

  test('a later duplicate returns null instead of rejecting', async () => {
    const guildId = 'guild-dup-later';
    const first = await createFavorite({
      guildId,
      authorId: 'user-1',
      name: 'keep',
      query: 'query one',
    });
    expect(first).not.toBeNull();

    const second = await createFavorite({
      guildId,
      authorId: 'user-2',
      name: 'keep',
      query: 'query two',
    });
    expect(second).toBeNull();
  });
});

describe('getGuildSettings concurrent creation', () => {
  test('concurrent first access creates exactly one row', async () => {
    const guildId = 'guild-settings';

    const results = await Promise.all(Array.from({ length: 8 }, () => getGuildSettings(guildId)));

    for (const settings of results) {
      expect(settings.guildId).toBe(guildId);
      expect(settings.playlistLimit).toBe(50);
      expect(settings.defaultVolume).toBe(100);
    }

    const rows = await db.select().from(setting).where(eq(setting.guildId, guildId));
    expect(rows).toHaveLength(1);
  });

  test('lazy creation then update keeps a single row', async () => {
    const guildId = 'guild-settings-2';
    const settings = await getGuildSettings(guildId);
    expect(settings.playlistLimit).toBe(50);

    await db.update(setting).set({ playlistLimit: 10 }).where(eq(setting.guildId, guildId));

    const rows = await db.select().from(setting).where(eq(setting.guildId, guildId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.playlistLimit).toBe(10);
  });
});

describe('inert settings surfaces removed', () => {
  test('schema no longer declares the inert columns', () => {
    expect(setting).not.toHaveProperty('queueAddResponseEphemeral');
    expect(setting).not.toHaveProperty('autoAnnounceNextSong');
  });

  test('both locales drop the inert config keys', () => {
    for (const language of [en, esUY]) {
      expect(language.commands.config).not.toHaveProperty('setQueueAddResponseHidden');
      expect(language.commands.config).not.toHaveProperty('setAutoAnnounceNextSong');
      expect(language.config.updated).not.toHaveProperty('queueAddNotification');
      expect(language.config.updated).not.toHaveProperty('autoAnnounce');
      expect(language.config.labels).not.toHaveProperty('autoAnnounceNextSong');
      expect(language.config.labels).not.toHaveProperty('addToQueueResponses');
    }
  });
});
