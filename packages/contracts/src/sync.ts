import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { resourceTypeSchema } from './domain.js';

export const syncOperationSchema = z.object({
  operationId: uuidSchema,
  clientId: uuidSchema,
  entityType: resourceTypeSchema,
  entityId: uuidSchema,
  action: z.enum(['create', 'update', 'delete']),
  baseVersion: z.number().int().min(0),
  payload: z.record(z.string(), z.unknown()).nullable(),
  queuedAt: isoDateTimeSchema,
});

export const syncPushRequestSchema = z.object({
  syncContractVersion: z.literal(1),
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export const syncOperationResultSchema = z.object({
  operationId: uuidSchema,
  status: z.enum(['accepted', 'duplicate', 'conflict', 'rejected']),
  entityType: resourceTypeSchema,
  entityId: uuidSchema,
  version: z.number().int().positive().optional(),
  serverValue: z.record(z.string(), z.unknown()).optional(),
  clientValue: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().optional(),
});

export const syncPushResponseSchema = z.object({
  syncContractVersion: z.literal(1),
  results: z.array(syncOperationResultSchema),
});

export const changeSchema = z.object({
  sequence: z.number().int().positive(),
  entityType: resourceTypeSchema,
  entityId: uuidSchema,
  action: z.enum(['upsert', 'delete']),
  version: z.number().int().positive(),
  changedAt: isoDateTimeSchema,
  value: z.record(z.string(), z.unknown()).nullable(),
});

export const syncPullResponseSchema = z.object({
  syncContractVersion: z.literal(1),
  changes: z.array(changeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
  fullResyncRequired: z.boolean(),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncOperationResult = z.infer<typeof syncOperationResultSchema>;
export type Change = z.infer<typeof changeSchema>;
