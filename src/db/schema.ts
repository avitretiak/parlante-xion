import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const setting = sqliteTable('Setting', {
  guildId: text('guildId').primaryKey(),
  playlistLimit: integer('playlistLimit').notNull().default(50),
  secondsToWaitAfterQueueEmpties: integer('secondsToWaitAfterQueueEmpties').notNull().default(30),
  leaveIfNoListeners: integer('leaveIfNoListeners', { mode: 'boolean' }).notNull().default(true),
  defaultVolume: integer('defaultVolume').notNull().default(100),
  defaultQueuePageSize: integer('defaultQueuePageSize').notNull().default(10),
  reportChannelId: text('reportChannelId'),
});

export const favoriteQuery = sqliteTable(
  'FavoriteQuery',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guildId').notNull(),
    authorId: text('authorId').notNull(),
    name: text('name').notNull(),
    query: text('query').notNull(),
  },
  (table) => [unique('uniqueGuildName').on(table.guildId, table.name)],
);

export type Setting = typeof setting.$inferSelect;
export type FavoriteQuery = typeof favoriteQuery.$inferSelect;
