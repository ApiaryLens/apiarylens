import { createBuildIdentity, type BuildIdentity } from '@apiarylens/contracts';

export const frontendBuild = createBuildIdentity({
  deploymentProfile:
    (import.meta.env.VITE_DEPLOYMENT_PROFILE as BuildIdentity['deploymentProfile'] | undefined) ??
    'development',
  sourceCommit: import.meta.env.VITE_SOURCE_COMMIT,
  buildTime: import.meta.env.VITE_BUILD_TIME,
  artifactIdentity: import.meta.env.VITE_ARTIFACT_IDENTITY,
});

// Design v2 §4.3(a): a Windows build shipped without Authenticode signing must
// carry the UNSIGNED-PREVIEW label in the UI as well as in the Setup filename.
// The label text is baked in at packaging time by scripts/build-windows-package.mjs
// (from the release workflow's resolved signing mode) and is absent in every
// other build, so browsers and signed builds never show it. The token is
// deliberately never written as a source literal: its presence in a built
// bundle proves the packaging step baked it in.
export const windowsPackageLabel: string | undefined = import.meta.env
  .VITE_WINDOWS_PACKAGE_LABEL as string | undefined;
