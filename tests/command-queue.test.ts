import { describe, expect, test } from 'bun:test';
import { runExclusive } from '../src/middlewares/command-queue';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('runExclusive', () => {
  test('serializes tasks within the same guild in arrival order', async () => {
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        runExclusive('guild-a', async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await sleep(5);
          order.push(n);
          active -= 1;
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3, 4]);
    expect(maxActive).toBe(1);
  });

  test('allows concurrent execution across different guilds', async () => {
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      ['guild-x', 'guild-y', 'guild-z'].map((guildId) =>
        runExclusive(guildId, async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await sleep(10);
          active -= 1;
        }),
      ),
    );

    expect(maxActive).toBe(3);
  });

  test('releases the lock when a task throws', async () => {
    await expect(
      runExclusive('guild-b', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    let ran = false;
    await runExclusive('guild-b', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test('a fresh task never waits on a stale entry after the queue drained', async () => {
    for (let i = 0; i < 50; i += 1) {
      await runExclusive('guild-c', async () => {
        await sleep(1);
      });
    }

    const start = Date.now();
    await runExclusive('guild-c', async () => {});
    expect(Date.now() - start).toBeLessThan(50);
  });
});
