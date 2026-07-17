import type { SessionView } from '@apiarylens/contracts';

export type BootstrapSession = SessionView & { recoveryCodes: string[] };

type DesktopBootstrapBridge = {
  bootstrapOwner(input: {
    identifier: string;
    displayName: string;
    password: string;
    organizationName: string;
    timezone: string;
  }): Promise<BootstrapSession>;
};

function desktopBridge(): DesktopBootstrapBridge | undefined {
  return (window as typeof window & { apiaryLensDesktop?: DesktopBootstrapBridge })
    .apiaryLensDesktop;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function noContent(url: string, init?: RequestInit): Promise<void> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
      message?: string;
    };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
}

export const api = {
  bootstrapStatus: async () => {
    const status = await json<{ available: boolean; requiresToken?: boolean }>(
      '/api/v1/bootstrap/status',
    );
    return desktopBridge() && status.available ? { ...status, requiresToken: false } : status;
  },
  session: () => json<SessionView>('/api/v1/session'),
  bootstrap: (input: {
    identifier: string;
    displayName: string;
    password: string;
    organizationName: string;
    timezone: string;
    bootstrapToken?: string;
  }) => {
    const desktop = desktopBridge();
    if (desktop) {
      const { bootstrapToken: _ignored, ...owner } = input;
      return desktop.bootstrapOwner(owner);
    }
    return json<BootstrapSession>('/api/v1/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  },
  signIn: (identifier: string, password: string) =>
    json<SessionView>('/api/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    }),
  acceptInvitation: (token: string, password: string) =>
    json<SessionView>('/api/v1/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }),
  recover: (identifier: string, recoveryCode: string, newPassword: string) =>
    fetch('/api/v1/auth/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, recoveryCode, newPassword }),
    }).then((response) => {
      if (!response.ok) throw new Error('Recovery failed. Check the identifier and unused code.');
    }),
  members: () =>
    json<{
      items: Array<{
        id: string;
        displayName: string;
        identifier: string;
        role: string;
        status: string;
      }>;
    }>('/api/v1/members'),
  invitations: () =>
    json<{
      items: Array<{
        id: string;
        displayName: string;
        identifier: string;
        role: string;
        expiresAt: string;
        createdAt: string;
      }>;
    }>('/api/v1/invitations'),
  revokeMember: (csrfToken: string, membershipId: string) =>
    noContent(`/api/v1/members/${encodeURIComponent(membershipId)}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken },
    }),
  revokeInvitation: (csrfToken: string, invitationId: string) =>
    noContent(`/api/v1/invitations/${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': csrfToken },
    }),
  replaceInvitation: (csrfToken: string, invitationId: string) =>
    json<{ token: string; expiresAt: string }>(
      `/api/v1/invitations/${encodeURIComponent(invitationId)}/replace`,
      { method: 'POST', headers: { 'x-csrf-token': csrfToken } },
    ),
  invite: (
    csrfToken: string,
    input: { displayName: string; identifier: string; role: 'beekeeper' | 'viewer' },
  ) =>
    json<{ token: string; expiresAt: string }>('/api/v1/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ ...input, expiresInHours: 48 }),
    }),
  signOut: (csrfToken: string) =>
    fetch('/api/v1/auth/sign-out', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': csrfToken },
    }),
  revokeOtherSessions: (csrfToken: string) =>
    json<{ revoked: number }>('/api/v1/session/revoke-others', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    }),
};
