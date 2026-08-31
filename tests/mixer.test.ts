import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
  addMixLayer,
  deleteAllMixLayers,
  deleteMixLayer,
  listMixLayers,
} from '../src/services/mixer';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// A fetch stub that only settles when its request signal aborts, so a test can
// simulate AbortSignal.timeout firing without waiting the real 30 seconds.
const abortingFetch = (): { fetch: typeof globalThis.fetch; controller: AbortController } => {
  const controller = new AbortController();
  const fetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
      );
    })) as typeof globalThis.fetch;
  return { fetch, controller };
};

describe('mix REST calls', () => {
  test('addMixLayer settles to null when the request times out', async () => {
    const { fetch, controller } = abortingFetch();
    globalThis.fetch = fetch;
    const timeoutSpy = spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);

    const pending = addMixLayer('session-1', 'guild-1', 'encoded-1', 80);
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    controller.abort();

    await expect(pending).resolves.toBeNull();
  });

  test('listMixLayers settles to [] when the request times out', async () => {
    const { fetch, controller } = abortingFetch();
    globalThis.fetch = fetch;
    const timeoutSpy = spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);

    const pending = listMixLayers('session-1', 'guild-1');
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    controller.abort();

    await expect(pending).resolves.toEqual([]);
  });

  test('deleteMixLayer settles to false when the request times out', async () => {
    const { fetch, controller } = abortingFetch();
    globalThis.fetch = fetch;
    const timeoutSpy = spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);

    const pending = deleteMixLayer('session-1', 'guild-1', 'mix-1');
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    controller.abort();

    await expect(pending).resolves.toBe(false);
  });

  test('deleteAllMixLayers settles without throwing when the list request times out', async () => {
    const { fetch, controller } = abortingFetch();
    globalThis.fetch = fetch;
    spyOn(AbortSignal, 'timeout').mockImplementation(() => controller.signal);

    const pending = deleteAllMixLayers('session-1', 'guild-1');
    controller.abort();

    await expect(pending).resolves.toBeUndefined();
  });
});
