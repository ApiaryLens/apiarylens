import type { ResourceType, SyncOperation } from '@apiarylens/contracts';

export type SyncState =
  'local' | 'pending' | 'synchronizing' | 'synchronized' | 'conflicted' | 'failed';

export interface LocalResource {
  key: string;
  id: string;
  organizationId: string;
  entityType: ResourceType;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
  data: Record<string, unknown>;
  conflict?: {
    serverValue: Record<string, unknown>;
    clientValue: Record<string, unknown>;
  };
}

export interface OutboxItem extends SyncOperation {
  key: string;
  organizationId?: string;
  attempts: number;
  lastError?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface LocalMedia {
  id: string;
  organizationId: string;
  blob: Blob;
  thumbnail?: Blob;
  state: 'staged' | 'uploading' | 'ready' | 'failed';
  lastError?: string;
}
