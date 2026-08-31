import path from 'node:path';
import type { NodeOption } from 'shoukaku';

const DEFAULT_NODELINK_URL = 'localhost:2333';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ? process.env.DATA_DIR : '/data');

export const buildNodeConfig = (): NodeOption => {
  const rawUrl = process.env.NODELINK_URL ?? DEFAULT_NODELINK_URL;
  const auth = process.env.NODELINK_PASSWORD ?? '';

  if (/^https?:\/\//i.test(rawUrl)) {
    const parsed = new URL(rawUrl);
    return {
      name: 'nodelink',
      url: `${parsed.hostname}:${parsed.port || 2333}`,
      auth,
      secure: parsed.protocol === 'https:',
    };
  }

  return {
    name: 'nodelink',
    url: rawUrl,
    auth,
  };
};
