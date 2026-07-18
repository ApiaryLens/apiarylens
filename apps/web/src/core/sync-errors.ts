export class SyncRequestError extends Error {
  readonly retryable: boolean;

  constructor(
    operation: string,
    readonly status: number,
    message = `${operation} failed (${status})`,
  ) {
    super(message);
    this.name = 'SyncRequestError';
    this.retryable =
      status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
  }
}

export function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof SyncRequestError) return error.retryable;
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException)
    return error.name === 'AbortError' || error.name === 'NetworkError';
  return Boolean((error as { retryable?: boolean } | null)?.retryable);
}

export function requiresSessionRefresh(error: unknown): boolean {
  return error instanceof SyncRequestError && (error.status === 401 || error.status === 403);
}
