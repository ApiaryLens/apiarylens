import { describe, expect, it, vi } from 'vitest';
import { OnlineSyncScheduler } from './sync-scheduler.js';

describe('online sync scheduler', () => {
  it('coalesces concurrent triggers into one serialized follow-up pass', async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const synchronize = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    const scheduler = new OnlineSyncScheduler({ isOnline: () => true, synchronize });

    const opening = scheduler.request('open');
    void scheduler.request('save');
    void scheduler.request('reconnect');
    expect(synchronize).toHaveBeenCalledTimes(1);
    release();
    await opening;

    expect(synchronize).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('does not attempt network work while offline', async () => {
    const synchronize = vi.fn();
    const scheduler = new OnlineSyncScheduler({ isOnline: () => false, synchronize });
    await scheduler.request('save');
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('automatically retries recoverable failures without labeling permanent failures retryable', async () => {
    vi.useFakeTimers();
    const recoverable = Object.assign(new Error('network unavailable'), { retryable: true });
    const synchronize = vi.fn().mockRejectedValueOnce(recoverable).mockResolvedValue(undefined);
    const scheduler = new OnlineSyncScheduler({
      isOnline: () => true,
      synchronize,
      shouldRetry: (error) => Boolean((error as { retryable?: boolean }).retryable),
      retryDelaysMs: [25],
    });

    await scheduler.request('save');
    expect(synchronize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(25);
    expect(synchronize).toHaveBeenCalledTimes(2);
    scheduler.stop();
    vi.useRealTimers();
  });

  it('aborts active network work and does not retry after cancellation', async () => {
    vi.useFakeTimers();
    const canceled = vi.fn();
    const synchronize = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const scheduler = new OnlineSyncScheduler({
      isOnline: () => true,
      synchronize,
      retryDelaysMs: [10],
      onCanceled: canceled,
    });

    const running = scheduler.request('save');
    scheduler.cancel();
    await running;
    await vi.advanceTimersByTimeAsync(20);

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(canceled).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
