import { z } from 'zod';
import {
  bootstrapRequestSchema,
  invitationAcceptSchema,
  invitationCreateSchema,
  signInRequestSchema,
} from './auth.js';
import { apiErrorSchema } from './common.js';
import { resourceSchemas } from './domain.js';
import { syncPullResponseSchema, syncPushRequestSchema, syncPushResponseSchema } from './sync.js';

const json = (schema: z.ZodType) => ({ 'application/json': { schema: z.toJSONSchema(schema) } });

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ApiaryLens API',
      version: '1.0.0',
      description: 'Portable, organization-scoped API for the ApiaryLens offline-first PWA.',
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Identity' },
      { name: 'Synchronization' },
      { name: 'Resources' },
      { name: 'Media' },
      { name: 'Ownership' },
    ],
    paths: {
      '/bootstrap': {
        post: operation(
          'Identity',
          'Create the first owner and family',
          bootstrapRequestSchema,
          201,
        ),
      },
      '/auth/sign-in': {
        post: operation('Identity', 'Start a secure browser session', signInRequestSchema, 200),
      },
      '/invitations': {
        post: operation(
          'Identity',
          'Create an expiring family invitation',
          invitationCreateSchema,
          201,
        ),
      },
      '/invitations/accept': {
        post: operation('Identity', 'Accept a family invitation', invitationAcceptSchema, 201),
      },
      '/sync/push': {
        post: operation(
          'Synchronization',
          'Apply an ordered idempotent mutation batch',
          syncPushRequestSchema,
          200,
          syncPushResponseSchema,
        ),
      },
      '/sync/pull': {
        get: {
          tags: ['Synchronization'],
          summary: 'Read organization changes after an opaque cursor',
          parameters: [
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 250 },
            },
          ],
          responses: {
            '200': { description: 'Change page', content: json(syncPullResponseSchema) },
          },
        },
      },
      '/resources/{type}': {
        get: {
          tags: ['Resources'],
          summary: 'List active records of one resource type',
          parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Resource collection' } },
        },
      },
      '/media/{id}/content': {
        get: mediaOperation('Download authorized original image'),
        put: mediaOperation('Upload and integrity-check original image'),
        delete: mediaOperation('Delete private image content'),
      },
      '/export/full': {
        get: {
          tags: ['Ownership'],
          summary: 'Download structured data, CSV files, and original media',
          responses: {
            '200': {
              description: 'Portable ZIP export',
              content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        browserSession: { type: 'apiKey', in: 'cookie', name: '__Host-apiarylens-session' },
        csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
      },
      schemas: {
        ApiError: z.toJSONSchema(apiErrorSchema),
        ...Object.fromEntries(
          Object.entries(resourceSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
        ),
      },
    },
    security: [{ browserSession: [] }],
  };
}

function operation(
  tag: string,
  summary: string,
  request: z.ZodType,
  success: number,
  response?: z.ZodType,
) {
  return {
    tags: [tag],
    summary,
    requestBody: { required: true, content: json(request) },
    responses: {
      [String(success)]: {
        description: 'Success',
        ...(response ? { content: json(response) } : {}),
      },
      '400': { description: 'Invalid request', content: json(apiErrorSchema) },
      '401': { description: 'Authentication required', content: json(apiErrorSchema) },
      '403': { description: 'Permission denied', content: json(apiErrorSchema) },
    },
  };
}

function mediaOperation(summary: string) {
  return {
    tags: ['Media'],
    summary,
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '200': { description: 'Success' },
      '404': { description: 'Media not found' },
    },
  };
}
