import { describe, expect, it } from 'vitest';
import { isRetryableSyncError, requiresSessionRefresh, SyncRequestError } from './sync-errors.js';

describe('sync errors', () => {
  it('marks transient statuses retryable and permanent rejections not', () => {
    for (const status of [401, 403, 408, 429, 500, 502, 503]) {
      expect(new SyncRequestError('Push', status).retryable).toBe(true);
    }
    for (const status of [400, 404, 409, 422]) {
      expect(new SyncRequestError('Push', status).retryable).toBe(false);
    }
  });

  it('treats network-shaped failures as retryable', () => {
    expect(isRetryableSyncError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableSyncError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isRetryableSyncError({ retryable: true })).toBe(true);
    expect(isRetryableSyncError(new Error('validation failed'))).toBe(false);
    expect(isRetryableSyncError(undefined)).toBe(false);
  });

  it('requires a session refresh only for authentication statuses', () => {
    expect(requiresSessionRefresh(new SyncRequestError('Push', 401))).toBe(true);
    expect(requiresSessionRefresh(new SyncRequestError('Push', 403))).toBe(true);
    expect(requiresSessionRefresh(new SyncRequestError('Push', 500))).toBe(false);
    expect(requiresSessionRefresh(new Error('401'))).toBe(false);
  });
});
