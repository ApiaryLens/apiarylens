import type { SessionView } from '@apiarylens/contracts';

export const desktopBridgeVersion = 1 as const;

export type DesktopBootstrapInput = {
  identifier: string;
  displayName: string;
  password: string;
  organizationName: string;
  timezone: string;
};

export type DesktopBootstrapSession = SessionView & { recoveryCodes: string[] };

export type DesktopRuntimeStatus = {
  bridgeVersion: typeof desktopBridgeVersion;
  mode: 'standalone';
  serviceProtocolVersion: number;
  productVersion: string;
};

export type DesktopBackupResult =
  { status: 'canceled' } | { status: 'saved'; path: string; createdAt: string; files: number };

export type DesktopRestoreResult =
  | { status: 'canceled' }
  | {
      status: 'restored';
      sourceCreatedAt: string;
      files: number;
      recoveryBackupPath: string;
    };

export type DesktopMigrationResult =
  | { status: 'canceled' }
  | {
      status: 'connected';
      migrationId: string;
      records: number;
      media: number;
      backupPath: string;
    };

export type DesktopBridge = {
  runtimeStatus(): Promise<DesktopRuntimeStatus>;
  bootstrapOwner(input: DesktopBootstrapInput): Promise<DesktopBootstrapSession>;
  /**
   * Disconnected-mode onboarding and silent re-authentication. The Windows
   * host owns a generated device credential, so a disconnected apiary reaches
   * a working session with zero account creation and zero network access.
   * Recovery codes are never returned — there is no password for a person to
   * lose. Throws when the standalone owner is a person-created account; the
   * renderer then falls back to the standard sign-in screen.
   */
  provisionDeviceOwner(): Promise<SessionView>;
  createStandaloneBackup(): Promise<DesktopBackupResult>;
  restoreStandaloneBackup(): Promise<DesktopRestoreResult>;
  migrateStandaloneToConnected(): Promise<DesktopMigrationResult>;
};

declare global {
  interface Window {
    apiaryLensDesktop: DesktopBridge;
  }
}
