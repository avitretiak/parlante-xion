import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ? process.env.DATA_DIR : '/data');
