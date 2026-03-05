import { info } from '#parlante/utils/system/logger';
import { db } from '#parlante/db';
import { keyValueCache } from '#parlante/db/schema';

(async () => {
  info('Clearing key value cache...');

  await db.delete(keyValueCache);

  info('Key value cache cleared.');
})();
