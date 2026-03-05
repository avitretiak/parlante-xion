CREATE TABLE `FavoriteQuery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guildId` text NOT NULL,
	`authorId` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniqueGuildName` ON `FavoriteQuery` (`guildId`,`name`);--> statement-breakpoint
CREATE TABLE `KeyValueCache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Setting` (
	`guildId` text PRIMARY KEY NOT NULL,
	`playlistLimit` integer DEFAULT 50 NOT NULL,
	`secondsToWaitAfterQueueEmpties` integer DEFAULT 30 NOT NULL,
	`leaveIfNoListeners` integer DEFAULT true NOT NULL,
	`queueAddResponseEphemeral` integer DEFAULT false NOT NULL,
	`autoAnnounceNextSong` integer DEFAULT false NOT NULL,
	`defaultVolume` integer DEFAULT 100 NOT NULL,
	`defaultQueuePageSize` integer DEFAULT 10 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
