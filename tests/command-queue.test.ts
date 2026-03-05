import { describe, expect, test } from 'bun:test';
import { CommandQueue, CommandQueueManager } from '../src/utils/system/command-queue';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('CommandQueue', () => {
  test('executes a single command', async () => {
    const queue = new CommandQueue();
    let executed = false;

    await queue.enqueue(async () => {
      executed = true;
    });

    expect(executed).toBe(true);
  });

  test('executes commands sequentially, not in parallel', async () => {
    const queue = new CommandQueue();
    const executionOrder: number[] = [];

    const p1 = queue.enqueue(async () => {
      executionOrder.push(1);
      await delay(50);
      executionOrder.push(2);
    });

    const p2 = queue.enqueue(async () => {
      executionOrder.push(3);
      await delay(10);
      executionOrder.push(4);
    });

    await Promise.all([p1, p2]);

    expect(executionOrder).toEqual([1, 2, 3, 4]);
  });

  test('handles command errors without blocking the queue', async () => {
    const queue = new CommandQueue();
    const executionOrder: string[] = [];

    const p1 = queue
      .enqueue(async () => {
        executionOrder.push('cmd1-start');
        throw new Error('command 1 failed');
      })
      .catch(() => {
        executionOrder.push('cmd1-caught');
      });

    const p2 = queue.enqueue(async () => {
      executionOrder.push('cmd2-start');
      executionOrder.push('cmd2-end');
    });

    await Promise.all([p1, p2]);

    expect(executionOrder).toContain('cmd1-start');
    expect(executionOrder).toContain('cmd1-caught');
    expect(executionOrder).toContain('cmd2-start');
    expect(executionOrder).toContain('cmd2-end');
  });

  test('propagates errors to the caller', async () => {
    const queue = new CommandQueue();

    await expect(
      queue.enqueue(async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');
  });

  test('getQueueSize reflects pending commands', async () => {
    const queue = new CommandQueue();
    expect(queue.getQueueSize()).toBe(0);

    let resolveBlock!: () => void;
    const block = new Promise<void>((r) => {
      resolveBlock = r;
    });

    const p1 = queue.enqueue(async () => {
      await block;
    });

    await delay(10);

    const p2 = queue.enqueue(async () => {});
    expect(queue.getQueueSize()).toBeGreaterThanOrEqual(1);

    resolveBlock();
    await Promise.all([p1, p2]);
  });

  test('isBusy returns true while processing', async () => {
    const queue = new CommandQueue();
    expect(queue.isBusy()).toBe(false);

    let resolveBlock!: () => void;
    const block = new Promise<void>((r) => {
      resolveBlock = r;
    });

    const p = queue.enqueue(async () => {
      await block;
    });

    await delay(10);
    expect(queue.isBusy()).toBe(true);

    resolveBlock();
    await p;
    expect(queue.isBusy()).toBe(false);
  });
});

describe('CommandQueueManager', () => {
  test('returns the same queue for the same guild', () => {
    const manager = new CommandQueueManager();
    const q1 = manager.getQueue('guild-1');
    const q2 = manager.getQueue('guild-1');
    expect(q1).toBe(q2);
  });

  test('returns different queues for different guilds', () => {
    const manager = new CommandQueueManager();
    const q1 = manager.getQueue('guild-1');
    const q2 = manager.getQueue('guild-2');
    expect(q1).not.toBe(q2);
  });

  test('removeQueue cleans up the guild entry', () => {
    const manager = new CommandQueueManager();
    const q1 = manager.getQueue('guild-1');
    manager.removeQueue('guild-1');
    const q2 = manager.getQueue('guild-1');
    expect(q2).not.toBe(q1);
  });

  test('serializes concurrent commands for the same guild', async () => {
    const manager = new CommandQueueManager();
    const executionOrder: number[] = [];

    const queue = manager.getQueue('guild-1');

    const p1 = queue.enqueue(async () => {
      executionOrder.push(1);
      await delay(30);
      executionOrder.push(2);
    });

    const p2 = queue.enqueue(async () => {
      executionOrder.push(3);
      await delay(10);
      executionOrder.push(4);
    });

    await Promise.all([p1, p2]);
    expect(executionOrder).toEqual([1, 2, 3, 4]);
  });

  test('allows parallel execution across different guilds', async () => {
    const manager = new CommandQueueManager();
    const executionOrder: string[] = [];

    const q1 = manager.getQueue('guild-1');
    const q2 = manager.getQueue('guild-2');

    const p1 = q1.enqueue(async () => {
      executionOrder.push('g1-start');
      await delay(50);
      executionOrder.push('g1-end');
    });

    const p2 = q2.enqueue(async () => {
      executionOrder.push('g2-start');
      await delay(10);
      executionOrder.push('g2-end');
    });

    await Promise.all([p1, p2]);

    const g2EndIdx = executionOrder.indexOf('g2-end');
    const g1EndIdx = executionOrder.indexOf('g1-end');
    expect(g2EndIdx).toBeLessThan(g1EndIdx);
  });
});
