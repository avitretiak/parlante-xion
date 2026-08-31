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

// Ensure the directory exists before creating the database.
// mkdirSync with recursive:true is required here because module-level
// initialization cannot await, and it already treats existing directories
// as a success (no EEXIST to swallow).
mkdirSync(dirname(dbPath), { recursive: true });

const database = new Database(dbPath);
// Enable WAL mode for better concurrency and performance
database.exec('PRAGMA journal_mode = WAL');
database.exec('PRAGMA synchronous = NORMAL');
export const db = drizzle(database, { schema });
