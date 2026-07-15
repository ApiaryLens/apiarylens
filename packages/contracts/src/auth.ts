import { z } from 'zod';
import { entityMetaSchema, isoDateTimeSchema, nonBlankSchema, uuidSchema } from './common.js';

export const roleSchema = z.enum(['owner', 'beekeeper', 'viewer']);
export type Role = z.infer<typeof roleSchema>;

export const permissionSchema = z.enum([
  'organization:read',
  'organization:manage',
  'members:read',
  'members:manage',
  'apiaries:read',
  'apiaries:write',
  'hives:read',
  'hives:write',
  'inspections:read',
  'inspections:write',
  'care:read',
  'care:write',
  'media:read',
  'media:write',
  'export:complete',
  'backup:operate',
  'security:manage',
]);
export type Permission = z.infer<typeof permissionSchema>;

export const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  owner: permissionSchema.options,
  beekeeper: [
    'organization:read',
    'members:read',
    'apiaries:read',
    'apiaries:write',
    'hives:read',
    'hives:write',
    'inspections:read',
    'inspections:write',
    'care:read',
    'care:write',
    'media:read',
    'media:write',
  ],
  viewer: [
    'organization:read',
    'members:read',
    'apiaries:read',
    'hives:read',
    'inspections:read',
    'care:read',
    'media:read',
  ],
};

export const userSchema = z.object({
  id: uuidSchema,
  identifier: z.string().trim().min(3).max(254),
  displayName: nonBlankSchema.max(120),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  disabledAt: isoDateTimeSchema.nullable(),
});

export const organizationSchema = entityMetaSchema.extend({
  name: nonBlankSchema.max(120),
  timezone: z.string().min(1).max(80),
});

export const membershipSchema = entityMetaSchema.extend({
  userId: uuidSchema,
  role: roleSchema,
  status: z.enum(['invited', 'active', 'revoked']),
});

export const bootstrapRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  displayName: nonBlankSchema.max(120),
  password: z.string().min(12).max(1024),
  organizationName: nonBlankSchema.max(120),
  timezone: z.string().min(1).max(80),
  bootstrapToken: z.string().min(20).max(512).optional(),
});

export const signInRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
});

export const invitationCreateSchema = z.object({
  displayName: nonBlankSchema.max(120),
  identifier: z.string().trim().min(3).max(254),
  role: roleSchema.exclude(['owner']),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export const invitationAcceptSchema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(12).max(1024),
});

export const recoveryRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  recoveryCode: z.string().min(16).max(256),
  newPassword: z.string().min(12).max(1024),
});

export const sessionViewSchema = z.object({
  user: userSchema,
  organization: organizationSchema,
  membership: membershipSchema,
  csrfToken: z.string().min(32),
  expiresAt: isoDateTimeSchema,
});

export type User = z.infer<typeof userSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type SessionView = z.infer<typeof sessionViewSchema>;
