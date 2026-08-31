import { eq } from 'drizzle-orm';
import { db } from '#parlante/db';
import { setting, type Setting } from '#parlante/db/schema';

async function createGuildSettings(guildId: string): Promise<Setting> {
  // Conflict-aware insert: concurrent first access from multiple commands
  // settles on exactly one row, then the canonical select returns it.
  await db.insert(setting).values({ guildId }).onConflictDoNothing({ target: setting.guildId });

  const [settings] = await db.select().from(setting).where(eq(setting.guildId, guildId)).limit(1);

  return settings!;
}

interface CachedSettings {
  settings: Setting;
  expiresAt: number;
}

const settingsCache = new Map<string, CachedSettings>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500; // Maximum number of cached guild settings

export async function getGuildSettings(guildId: string): Promise<Setting> {
  const cached = settingsCache.get(guildId);
  const now = Date.now();

  if (cached && now < cached.expiresAt) {
    return cached.settings;
  }

  const config = await db
    .select()
    .from(setting)
    .where(eq(setting.guildId, guildId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const settings = config || (await createGuildSettings(guildId));

  // Evict oldest entry if cache exceeds max size
  if (settingsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = settingsCache.keys().next().value;
    if (firstKey) {
      settingsCache.delete(firstKey);
    }
  }

  settingsCache.set(guildId, {
    settings,
    expiresAt: now + CACHE_TTL,
  });

  return settings;
}

/**
 * Invalidate cached guild settings. Call this when settings are updated.
 */
export function invalidateGuildSettingsCache(guildId: string): void {
  settingsCache.delete(guildId);
}
