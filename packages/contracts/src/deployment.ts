import { z } from 'zod';

const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  channel: z.enum(['preview', 'release-candidate', 'stable']),
  manifestUrl: z.string().url(),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const baseSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  release: releaseSchema,
  operation: z.enum(['install', 'update', 'backup', 'restore', 'export', 'uninstall']),
  keepDataOnUninstall: z.boolean().default(true),
});

const cloudflarePlanSchema = baseSchema.extend({
  target: z.literal('cloudflare'),
  cloudflare: z.object({
    accountReference: z.string().min(1).max(120),
    workerName: z.string().regex(/^apiarylens-[a-z0-9-]+$/),
    d1DatabaseName: z.string().regex(/^apiarylens-[a-z0-9-]+$/),
    r2BucketName: z.string().regex(/^apiarylens-[a-z0-9-]+$/),
    customDomain: z.string().min(1).max(253).optional(),
    costProfile: z.literal('family-free-guarded'),
    includeWebFrontend: z.boolean().default(true),
  }),
});

const composePlanSchema = baseSchema.extend({
  target: z.literal('compose-ssh'),
  compose: z.object({
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535).default(22),
    user: z.string().regex(/^[a-z_][a-z0-9_-]*$/i),
    targetDirectory: z.string().regex(/^\/[A-Za-z0-9._/-]+$/),
    projectName: z.string().regex(/^apiarylens-[a-z0-9-]+$/),
    publicUrl: z
      .string()
      .url()
      .refine((url) => url.startsWith('https://'), 'HTTPS is required'),
    sshHostKeySha256: z.string().regex(/^SHA256:[A-Za-z0-9+/=]+$/),
    backupRetention: z.number().int().min(2).max(90).default(14),
    includeWebFrontend: z.boolean().default(true),
  }),
});

export const deploymentPlanSchema = z.discriminatedUnion('target', [
  cloudflarePlanSchema,
  composePlanSchema,
]);

export type DeploymentPlan = z.infer<typeof deploymentPlanSchema>;
