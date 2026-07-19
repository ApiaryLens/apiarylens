import { z } from 'zod';
import {
  bootstrapRequestSchema,
  invitationAcceptSchema,
  invitationCreateSchema,
  recoveryRequestSchema,
  sessionViewSchema,
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
      '/bootstrap/status': {
        get: {
          tags: ['Identity'],
          summary: 'Check whether first-owner setup is available',
          security: [],
          responses: { '200': { description: 'Bootstrap availability' } },
        },
      },
      '/bootstrap': {
        post: publicOperation(
          'Identity',
          'Create the first owner and family',
          bootstrapRequestSchema,
          201,
        ),
      },
      '/auth/sign-in': {
        post: publicOperation(
          'Identity',
          'Start a secure browser session',
          signInRequestSchema,
          200,
          sessionViewSchema,
        ),
      },
      '/auth/recover': {
        post: publicOperation(
          'Identity',
          'Consume a recovery code and replace the account password',
          recoveryRequestSchema,
          204,
        ),
      },
      '/session': {
        get: {
          tags: ['Identity'],
          summary: 'Rotate and read the current authenticated session',
          responses: {
            '200': { description: 'Current session', content: json(sessionViewSchema) },
            '401': { description: 'Authentication required', content: json(apiErrorSchema) },
          },
        },
      },
      '/session/revoke-others': {
        post: {
          tags: ['Identity'],
          summary: 'Revoke every other session for the current user',
          security: [{ browserSession: [], csrf: [] }],
          responses: {
            '200': { description: 'Other sessions revoked' },
            '401': { description: 'Authentication required', content: json(apiErrorSchema) },
            '403': { description: 'Request verification failed', content: json(apiErrorSchema) },
          },
        },
      },
      '/auth/sign-out': {
        post: {
          tags: ['Identity'],
          summary: 'Revoke the current session',
          security: [{ browserSession: [], csrf: [] }],
          responses: {
            '204': { description: 'Session revoked' },
            '401': { description: 'Authentication required', content: json(apiErrorSchema) },
            '403': { description: 'Request verification failed', content: json(apiErrorSchema) },
          },
        },
      },
      '/members': {
        get: {
          tags: ['Identity'],
          summary: 'List active members in the current family',
          responses: {
            '200': { description: 'Member collection' },
            '403': { description: 'Permission denied', content: json(apiErrorSchema) },
          },
        },
      },
      '/members/{membershipId}': {
        delete: {
          tags: ['Identity'],
          summary: 'Remove a non-owner family member and revoke their sessions',
          security: [{ browserSession: [], csrf: [] }],
          parameters: [
            { name: 'membershipId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': { description: 'Membership revoked' },
            '403': { description: 'Permission denied', content: json(apiErrorSchema) },
            '404': { description: 'Membership not found', content: json(apiErrorSchema) },
            '409': { description: 'Owner membership is protected', content: json(apiErrorSchema) },
          },
        },
      },
      '/invitations': {
        get: {
          tags: ['Identity'],
          summary: 'List unexpired pending invitations for the current family',
          responses: {
            '200': { description: 'Pending invitation collection without invitation tokens' },
            '403': { description: 'Permission denied', content: json(apiErrorSchema) },
          },
        },
        post: csrfOperation(
          operation(
            'Identity',
            'Create an expiring family invitation',
            invitationCreateSchema,
            201,
          ),
        ),
      },
      '/invitations/{invitationId}': {
        delete: {
          tags: ['Identity'],
          summary: 'Revoke a pending invitation',
          security: [{ browserSession: [], csrf: [] }],
          parameters: [
            { name: 'invitationId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': { description: 'Invitation revoked' },
            '403': { description: 'Permission denied', content: json(apiErrorSchema) },
            '404': { description: 'Invitation not found', content: json(apiErrorSchema) },
          },
        },
      },
      '/invitations/{invitationId}/replace': {
        post: {
          tags: ['Identity'],
          summary: 'Revoke a pending invitation and create a replacement link',
          security: [{ browserSession: [], csrf: [] }],
          parameters: [
            { name: 'invitationId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '201': { description: 'Replacement invitation created' },
            '403': { description: 'Permission denied', content: json(apiErrorSchema) },
            '404': { description: 'Invitation not found', content: json(apiErrorSchema) },
          },
        },
      },
      '/invitations/accept': {
        post: publicOperation(
          'Identity',
          'Accept a family invitation',
          invitationAcceptSchema,
          201,
          sessionViewSchema,
        ),
      },
      '/sync/push': {
        post: csrfOperation(
          operation(
            'Synchronization',
            'Apply an ordered idempotent mutation batch',
            syncPushRequestSchema,
            200,
            syncPushResponseSchema,
          ),
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
      '/resources/{type}/{id}': {
        get: {
          tags: ['Resources'],
          summary: 'Read one active organization-scoped record',
          parameters: [
            { name: 'type', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Resource record' },
            '404': { description: 'Resource not found' },
          },
        },
      },
      '/media/{id}/content': {
        get: mediaOperation('Download authorized original image'),
        put: mediaOperation('Upload and integrity-check original image', true),
        delete: mediaOperation('Delete private image content', true),
      },
      '/media/{id}/thumbnail': {
        put: mediaOperation('Upload an authorized JPEG thumbnail', true),
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
      '/import/full': {
        post: csrfOperation({
          tags: ['Ownership'],
          summary: 'Restore the workspace from a full export archive, replacing current records',
          requestBody: {
            required: true,
            content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } },
          },
          responses: {
            '200': { description: 'Workspace replaced with the verified archive content' },
            '400': {
              description: 'The archive is not a valid export or failed integrity checks',
              content: json(apiErrorSchema),
            },
            '403': { description: 'Owner permission required', content: json(apiErrorSchema) },
          },
        }),
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

function publicOperation(
  tag: string,
  summary: string,
  request: z.ZodType,
  success: number,
  response?: z.ZodType,
) {
  return { ...operation(tag, summary, request, success, response), security: [] };
}

function csrfOperation<T extends Record<string, unknown>>(value: T) {
  return { ...value, security: [{ browserSession: [], csrf: [] }] };
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

function mediaOperation(summary: string, csrf = false) {
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
    ...(csrf ? { security: [{ browserSession: [], csrf: [] }] } : {}),
  };
}
