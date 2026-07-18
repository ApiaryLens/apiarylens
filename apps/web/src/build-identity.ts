import { createBuildIdentity, type BuildIdentity } from '@apiarylens/contracts';

export const frontendBuild = createBuildIdentity({
  deploymentProfile:
    (import.meta.env.VITE_DEPLOYMENT_PROFILE as BuildIdentity['deploymentProfile'] | undefined) ??
    'development',
  sourceCommit: import.meta.env.VITE_SOURCE_COMMIT,
  buildTime: import.meta.env.VITE_BUILD_TIME,
  artifactIdentity: import.meta.env.VITE_ARTIFACT_IDENTITY,
});
