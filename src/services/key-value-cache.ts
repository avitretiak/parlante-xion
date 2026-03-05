import messages from '#parlante/utils/constants/messages';
import { db } from '#parlante/db';
import { keyValueCache } from '#parlante/db/schema';
import { eq } from 'drizzle-orm';
import debug from '#parlante/utils/system/logger';
import { ValidationError } from '#parlante/utils/error/errors';

type Seconds = number;

type Options = {
  expiresIn: Seconds;
  key?: string;
};

const futureTimeToDate = (time: Seconds) => new Date(Date.now() + time * 1000);

export default class KeyValueCacheProvider {
  async wrap<TArgs extends readonly unknown[], F>(
    func: (...args: TArgs) => Promise<F>,
    ...options: [...TArgs, Options]
  ): Promise<F> {
    if (!options) {
      throw new ValidationError(messages.error.missingCacheOptions, 'MISSING_CACHE_OPTIONS');
    }

    const functionArgs = options.slice(0, options.length - 1);

    const { key = JSON.stringify(functionArgs), expiresIn } = options[
      options.length - 1
    ] as Options;

    if (key.length < 3) {
      throw new ValidationError(messages.error.cacheKeyTooShort(key), 'CACHE_KEY_TOO_SHORT');
    }

    const cachedResult = await db
      .select()
      .from(keyValueCache)
      .where(eq(keyValueCache.key, key))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (cachedResult) {
      if (new Date() < cachedResult.expiresAt) {
        debug(`Cache hit: ${key}`);
        return JSON.parse(cachedResult.value) as F;
      }

      await db.delete(keyValueCache).where(eq(keyValueCache.key, key));
    }

    debug(`Cache miss: ${key}`);

    const result = await func(...(functionArgs as unknown as TArgs));

    // Save result
    const value = JSON.stringify(result);
    const expiresAt = futureTimeToDate(expiresIn);
    await db
      .insert(keyValueCache)
      .values({
        key,
        value,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [keyValueCache.key],
        set: {
          value,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    return result;
  }
}
