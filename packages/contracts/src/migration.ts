import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';
import { resourceTypeSchema } from './domain.js';

export const MIGRATION_CONTRACT_VERSION = 1 as const;
export const MIGRATION_RECORD_BATCH_LIMIT = 100 as const;

export const migrationPhaseSchema = z.enum([
  'preflight',
  'quiesced',
  'protected',
  'inventoried',
  'transferring',
  'reconciled',
  'cutover',
  'observing',
  'finalized',
  'rolled_back',
]);

export const migrationInventoryItemSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_CONTRACT_VERSION),
    migrationId: uuidSchema,
    itemId: z.string().min(1).max(300),
    kind: z.enum(['record', 'media']),
    entityType: resourceTypeSchema,
    entityId: uuidSchema,
    variant: z.enum(['original', 'thumbnail']).optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().nonnegative(),
    deleted: z.boolean(),
  })
  .strict();

export const migrationReceiptSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_CONTRACT_VERSION),
    migrationId: uuidSchema,
    itemId: z.string().min(1).max(300),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    status: z.enum(['accepted', 'duplicate']),
    acceptedAt: isoDateTimeSchema,
  })
  .strict();

export const migrationCompletionSchema = z
  .object({
    schemaVersion: z.literal(MIGRATION_CONTRACT_VERSION),
    migrationId: uuidSchema,
    sourceOrganizationId: uuidSchema,
    targetOrganizationId: uuidSchema,
    inventorySha256: z.string().regex(/^[0-9a-f]{64}$/),
    recordCount: z.number().int().nonnegative(),
    mediaCount: z.number().int().nonnegative(),
    finalCursor: z.string().min(1),
    completedAt: isoDateTimeSchema,
  })
  .strict();

export type MigrationPhase = z.infer<typeof migrationPhaseSchema>;
export type MigrationInventoryItem = z.infer<typeof migrationInventoryItemSchema>;
export type MigrationReceipt = z.infer<typeof migrationReceiptSchema>;
export type MigrationCompletion = z.infer<typeof migrationCompletionSchema>;
