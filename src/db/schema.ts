import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const keyValueCache = sqliteTable('KeyValueCache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const setting = sqliteTable('Setting', {
  guildId: text('guildId').primaryKey(),
  playlistLimit: integer('playlistLimit').notNull().default(50),
  secondsToWaitAfterQueueEmpties: integer('secondsToWaitAfterQueueEmpties').notNull().default(30),
  leaveIfNoListeners: integer('leaveIfNoListeners', { mode: 'boolean' }).notNull().default(true),
  queueAddResponseEphemeral: integer('queueAddResponseEphemeral', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),
  autoAnnounceNextSong: integer('autoAnnounceNextSong', { mode: 'boolean' })
    .notNull()
    .default(false),
  defaultVolume: integer('defaultVolume').notNull().default(100),
  defaultQueuePageSize: integer('defaultQueuePageSize').notNull().default(10),
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const favoriteQuery = sqliteTable(
  'FavoriteQuery',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guildId').notNull(),
    authorId: text('authorId').notNull(),
    name: text('name').notNull(),
    query: text('query').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [unique('uniqueGuildName').on(table.guildId, table.name)],
);

export type Setting = typeof setting.$inferSelect;
export type FavoriteQuery = typeof favoriteQuery.$inferSelect;
export type KeyValueCacheEntry = typeof keyValueCache.$inferSelect;
