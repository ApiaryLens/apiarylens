import type { ConnectedIdentityCheck, WindowsConnectionProfile } from './connected-profile.js';

export type ConnectedImportPreview = {
  status: 'preview';
  profile: Array<[label: string, value: string]>;
  identity:
    | { state: 'matched'; productVersion: string; deploymentProfile: string }
    | { state: 'mismatch'; problems: string[] }
    | { state: 'unreachable'; message: string };
};

export type ConnectedImportResult =
  { status: 'canceled' } | { status: 'error'; message: string } | ConnectedImportPreview;

/**
 * The picker/preview/confirm steps of the first-run connected import are
 * separate renderer round-trips. This session holds the profile the last
 * matched preview described so confirm can only apply main-process-parsed
 * content — the renderer never supplies profile data. A canceled picker keeps
 * the previously matched profile, because the renderer still shows that
 * preview and its Connect action must stay honest.
 */
export class ConnectedImportSession {
  #pending: WindowsConnectionProfile | undefined;

  constructor(
    private readonly io: {
      readProfile: (path: string) => WindowsConnectionProfile;
      checkBackend: (profile: WindowsConnectionProfile) => Promise<ConnectedIdentityCheck>;
      describeProfile: (profile: WindowsConnectionProfile) => Array<[string, string]>;
    },
  ) {}

  async preview(selectedPath: string | undefined): Promise<ConnectedImportResult> {
    if (!selectedPath) return { status: 'canceled' };
    this.#pending = undefined;
    let imported: WindowsConnectionProfile;
    try {
      imported = this.io.readProfile(selectedPath);
    } catch (error) {
      return {
        status: 'error',
        message: `ApiaryLens could not read that profile: ${
          error instanceof Error ? error.message : 'unknown profile error'
        }`,
      };
    }
    const identity = await this.io.checkBackend(imported);
    if (identity.state === 'matched') this.#pending = imported;
    return {
      status: 'preview',
      profile: this.io.describeProfile(imported),
      identity:
        identity.state === 'matched'
          ? {
              state: 'matched',
              productVersion: identity.build.productVersion,
              deploymentProfile: identity.build.deploymentProfile,
            }
          : identity.state === 'mismatch'
            ? { state: 'mismatch', problems: identity.problems }
            : { state: 'unreachable', message: identity.message },
    };
  }

  confirm(): WindowsConnectionProfile {
    if (!this.#pending) throw new Error('No verified connection profile is awaiting confirmation');
    return this.#pending;
  }

  discard(): void {
    this.#pending = undefined;
  }
}
