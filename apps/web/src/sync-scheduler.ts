export type SyncTrigger = 'open' | 'resume' | 'reconnect' | 'save' | 'manual' | 'retry';

export interface SyncSchedulerOptions {
  isOnline: () => boolean;
  synchronize: (signal: AbortSignal) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  retryDelaysMs?: readonly number[];
  onStart?: (trigger: SyncTrigger) => void;
  onSuccess?: (trigger: SyncTrigger) => void;
  onError?: (error: unknown, trigger: SyncTrigger) => void;
  onCanceled?: () => void;
}

/**
 * Serializes lifecycle and local-save sync requests. Requests received while a
 * sync is running are coalesced into one follow-up pass so newly queued work is
 * never stranded and duplicate concurrent pushes are avoided.
 */
export class OnlineSyncScheduler {
  private requested = false;
  private trigger: SyncTrigger = 'open';
  private running: Promise<void> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryAttempt = 0;
  private stopped = false;
  private cancelGeneration = 0;
  private controller: AbortController | undefined;

  constructor(private readonly options: SyncSchedulerOptions) {}

  request(trigger: SyncTrigger): Promise<void> {
    if (this.stopped || !this.options.isOnline()) return Promise.resolve();
    this.requested = true;
    this.trigger = trigger;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = undefined;
        if (this.requested && !this.stopped && this.options.isOnline()) {
          void this.request(this.trigger);
        }
      });
    }
    return this.running;
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  cancel(): void {
    this.cancelGeneration += 1;
    this.requested = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.controller?.abort();
    this.options.onCanceled?.();
  }

  private async drain(): Promise<void> {
    while (this.requested && !this.stopped && this.options.isOnline()) {
      this.requested = false;
      const trigger = this.trigger;
      const generation = this.cancelGeneration;
      const controller = new AbortController();
      this.controller = controller;
      this.options.onStart?.(trigger);
      try {
        await this.options.synchronize(controller.signal);
        this.retryAttempt = 0;
        this.options.onSuccess?.(trigger);
      } catch (error) {
        if (generation !== this.cancelGeneration || controller.signal.aborted || this.stopped)
          return;
        this.options.onError?.(error, trigger);
        if (this.options.shouldRetry?.(error) ?? true) this.scheduleRetry();
        return;
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    }
  }

  private scheduleRetry(): void {
    const delays = this.options.retryDelaysMs ?? [2_000, 10_000, 30_000, 60_000];
    const delay = delays[Math.min(this.retryAttempt, delays.length - 1)] ?? 60_000;
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.request('retry');
    }, delay);
  }
}
