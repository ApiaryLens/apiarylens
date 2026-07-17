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

export type DesktopBridge = {
  runtimeStatus(): Promise<DesktopRuntimeStatus>;
  bootstrapOwner(input: DesktopBootstrapInput): Promise<DesktopBootstrapSession>;
};

declare global {
  interface Window {
    apiaryLensDesktop: DesktopBridge;
  }
}
