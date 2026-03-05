import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { DATA_DIR } from '#parlante/config';
import { createDatabasePath } from '#parlante/utils/config/create-database-url';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
let dbPath: string;

if (databaseUrl) {
  // Remove "file:" prefix and query parameters if present
  dbPath = databaseUrl.replace(/^file:/, '').split('?')[0]!;
} else {
  // Use the default path
  dbPath = createDatabasePath(DATA_DIR);
}

// Ensure the directory exists before creating the database
// Using mkdirSync for synchronous directory creation (required for module-level initialization)
try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch (error) {
  // Directory might already exist, which is fine
  // Only throw if it's a different error (permissions, etc.)
  const err = error as NodeJS.ErrnoException;
  if (err.code !== 'EEXIST') {
    throw error;
  }
}

const database = new Database(dbPath);
// Enable WAL mode for better concurrency and performance
database.exec('PRAGMA journal_mode = WAL');
database.exec('PRAGMA synchronous = NORMAL');
export const db = drizzle(database, { schema });
