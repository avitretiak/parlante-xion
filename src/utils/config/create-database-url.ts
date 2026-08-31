import { join } from 'node:path';

export const createDatabasePath = (directory: string) => join(directory, 'db.sqlite');
