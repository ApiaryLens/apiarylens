/**
 * A conformance backend is one deployed profile of the ApiaryLens product
 * contract. Every fixture in this package runs unchanged against every
 * backend: the fixtures define the cross-client contract, the drivers only
 * know how to stand one profile up in-process.
 */
export interface ForeignSeed {
  organizationId: string;
  apiaryId: string;
  mediaId: string;
  mediaBytes: Uint8Array<ArrayBuffer>;
  apiaryName: string;
}

export interface ConformanceBackend {
  readonly label: 'node' | 'cloudflare';
  readonly description: string;

  /** Dispatch an in-process HTTP request exactly as a client would issue it. */
  request(path: string, init?: RequestInit): Promise<Response>;

  /**
   * Arrange a second organization directly at the storage layer so isolation
   * fixtures can assert the API boundary. The arrangement is driver-specific;
   * the expected behavior is shared.
   */
  seedForeignOrganization(memberUserId: string): Promise<ForeignSeed>;

  /** Read a stored resource value at the storage layer for non-API assertions. */
  readResourceValue(
    organizationId: string,
    entityType: string,
    id: string,
  ): Record<string, unknown> | undefined;

  close(): void;
}

export interface BackendFactory {
  readonly label: 'node' | 'cloudflare';
  create(): ConformanceBackend;
}
