import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const nonBlankSchema = z.string().trim().min(1);
export const optionalTextSchema = z.string().trim().max(10_000).optional().nullable();

export const entityMetaSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  version: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
});

export type EntityMeta = z.infer<typeof entityMetaSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});
