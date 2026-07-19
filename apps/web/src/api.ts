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
  provisionDeviceOwner?(): Promise<SessionView>;
  createStandaloneBackup?(): Promise<
    { status: 'canceled' } | { status: 'saved'; path: string; createdAt: string; files: number }
  >;
  restoreStandaloneBackup?(): Promise<
    | { status: 'canceled' }
    | {
        status: 'restored';
        sourceCreatedAt: string;
        files: number;
        recoveryBackupPath: string;
      }
  >;
  migrateStandaloneToConnected?(): Promise<
    | { status: 'canceled' }
    | {
        status: 'connected';
        migrationId: string;
        records: number;
        media: number;
        backupPath: string;
      }
  >;
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
  /**
   * True inside the Windows standalone (disconnected-capable) shell, where the
   * embedded loopback service is always reachable regardless of what
   * `navigator.onLine` reports about external connectivity.
   */
  desktopStandalone: () => Boolean(desktopBridge()),
  /**
   * True when this is a local-only (standalone) session: the app is hosted by
   * a shell that embeds the loopback backend and the family chose no cloud
   * backend. Detection follows the connection-profile model (C7): a connected
   * profile makes the shell load the deployed backend origin with NO desktop
   * bridge, and a browser session always talks to a deployed backend — so the
   * bridge exists exactly when the session is local-only. Owner rule for this
   * mode (design v2 §1c, WEB-001): no sync affordance anywhere — absent, not
   * disabled — and first-class local backup and restore instead.
   */
  localOnlySession: () => Boolean(desktopBridge()),
  deviceOwnerProvisioningAvailable: () =>
    typeof desktopBridge()?.provisionDeviceOwner === 'function',
  provisionDeviceOwner: async (): Promise<SessionView> => {
    const provision = desktopBridge()?.provisionDeviceOwner;
    if (!provision)
      throw new Error('Device-managed setup is available only in ApiaryLens for Windows');
    return provision();
  },
  /**
   * True when the active session belongs to the hidden device-managed owner of
   * a no-account disconnected apiary. That owner has no password or recovery
   * codes a person could ever re-enter, so account-level actions like signing
   * out must not be offered (WIN-028). The identifier matches the fixed
   * `deviceOwnerIdentifier` the Windows host provisions.
   */
  deviceManagedSession: (view: Pick<SessionView, 'user'>): boolean =>
    typeof desktopBridge()?.provisionDeviceOwner === 'function' &&
    view.user.identifier === 'device-owner',
  standaloneBackupAvailable: () => typeof desktopBridge()?.createStandaloneBackup === 'function',
  createStandaloneBackup: async () => {
    const create = desktopBridge()?.createStandaloneBackup;
    if (!create) throw new Error('Standalone backup is available only in ApiaryLens for Windows');
    return create();
  },
  restoreStandaloneBackup: async () => {
    const restore = desktopBridge()?.restoreStandaloneBackup;
    if (!restore) throw new Error('Standalone restore is available only in ApiaryLens for Windows');
    return restore();
  },
  migrateStandaloneToConnected: async () => {
    const migrate = desktopBridge()?.migrateStandaloneToConnected;
    if (!migrate)
      throw new Error('Standalone migration is available only in ApiaryLens for Windows');
    return migrate();
  },
  bootstrapStatus: async () => {
    const status = await json<{ available: boolean; requiresToken?: boolean }>(
      '/api/v1/bootstrap/status',
    );
    return desktopBridge() && status.available ? { ...status, requiresToken: false } : status;
  },
  session: () => json<SessionView>('/api/v1/session'),
  /**
   * Restore the whole workspace from a downloaded backup archive. The server
   * verifies the archive's integrity completely before replacing anything and
   * refuses damaged or foreign files.
   */
  importFullBackup: (csrfToken: string, file: Blob) =>
    json<{
      status: 'restored';
      imported: number;
      removed: number;
      mediaFiles: number;
      mediaMissing: number;
      restoredAt: string;
    }>('/api/v1/import/full', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
      body: file,
    }),
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
