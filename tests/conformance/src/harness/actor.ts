import type { SessionView, SyncOperation, SyncOperationResult } from '@apiarylens/contracts';
import type { ConformanceBackend } from './backend.js';
import { MEMBER_PASSWORD, OWNER } from '../fixtures/data.js';

export interface ActorRequestOptions {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Set false to omit the CSRF header even when the actor holds a token. */
  csrf?: boolean;
  /** Set false to omit the session cookie even when the actor holds one. */
  cookie?: boolean;
}

export interface BootstrapBody extends SessionView {
  recoveryCodes: string[];
}

/**
 * One authenticated principal talking to one backend through the public HTTP
 * contract only: cookie session, CSRF header, JSON bodies. This is the same
 * surface every real client (web PWA, Windows host, future native clients)
 * uses.
 */
export class ApiActor {
  cookie = '';
  csrfToken = '';
  session: SessionView | undefined;

  constructor(readonly backend: ConformanceBackend) {}

  get organizationId(): string {
    if (!this.session) throw new Error('The actor is not signed in');
    return this.session.organization.id;
  }

  async request(path: string, options: ActorRequestOptions = {}): Promise<Response> {
    const headers = new Headers(options.headers ?? {});
    if (options.cookie !== false && this.cookie && !headers.has('cookie')) {
      headers.set('cookie', this.cookie);
    }
    if (options.csrf !== false && this.csrfToken && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', this.csrfToken);
    }
    let body = options.body;
    if (options.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(options.json);
    }
    const response = await this.backend.request(path, {
      method: options.method ?? (body === undefined ? 'GET' : 'POST'),
      ...(body === undefined ? {} : { body }),
      headers,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0] ?? '';
    return response;
  }

  async bootstrapOwner(overrides: Record<string, unknown> = {}): Promise<BootstrapBody> {
    const response = await this.request('/api/v1/bootstrap', {
      json: { ...OWNER, ...overrides },
    });
    if (response.status !== 201) {
      throw new Error(`Bootstrap failed with status ${response.status}`);
    }
    const body = (await response.json()) as BootstrapBody;
    this.session = body;
    this.csrfToken = body.csrfToken;
    return body;
  }

  async signIn(identifier: string, password: string): Promise<Response> {
    const response = await this.request('/api/v1/auth/sign-in', {
      json: { identifier, password },
    });
    if (response.status === 200) {
      const body = (await response.clone().json()) as SessionView;
      this.session = body;
      this.csrfToken = body.csrfToken;
    }
    return response;
  }

  async invite(
    role: 'beekeeper' | 'viewer',
    identifier = `${role}@conformance.test`,
  ): Promise<{ token: string; expiresAt: string }> {
    const response = await this.request('/api/v1/invitations', {
      json: {
        displayName: `Conformance ${role}`,
        identifier,
        role,
        expiresInHours: 48,
      },
    });
    if (response.status !== 201) {
      throw new Error(`Invitation creation failed with status ${response.status}`);
    }
    return (await response.json()) as { token: string; expiresAt: string };
  }

  async acceptInvitation(token: string, password = MEMBER_PASSWORD): Promise<Response> {
    const response = await this.request('/api/v1/invitations/accept', {
      json: { token, password },
    });
    if (response.status === 201) {
      const body = (await response.clone().json()) as SessionView;
      this.session = body;
      this.csrfToken = body.csrfToken;
    }
    return response;
  }

  async push(operations: SyncOperation[]): Promise<Response> {
    return this.request('/api/v1/sync/push', {
      json: { syncContractVersion: 1, operations },
    });
  }

  async mustPush(operations: SyncOperation[]): Promise<SyncOperationResult[]> {
    const response = await this.push(operations);
    if (response.status !== 200) {
      throw new Error(`Sync push failed with status ${response.status}`);
    }
    const body = (await response.json()) as { results: SyncOperationResult[] };
    return body.results;
  }

  async refreshSession(): Promise<Response> {
    const response = await this.request('/api/v1/session');
    if (response.status === 200) {
      const body = (await response.clone().json()) as SessionView;
      this.session = body;
      this.csrfToken = body.csrfToken;
    }
    return response;
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { code: string };
  return body.code;
}
