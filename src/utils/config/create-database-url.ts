import { join } from 'node:path';

export const createDatabasePath = (directory: string) => join(directory, 'db.sqlite');

const createDatabaseUrl = (directory: string) => {
  const url = `file:${createDatabasePath(directory)}?socket_timeout=10&connection_limit=1`;
  return url;
};

export default createDatabaseUrl;
