import { DATA_DIR } from '#parlante/config';
import { createDatabasePath } from '#parlante/utils/config/create-database-url';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: createDatabasePath(DATA_DIR),
  },
};
