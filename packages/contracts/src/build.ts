export const PRODUCT_NAME = 'ApiaryLens';
export const PRODUCT_VERSION = '0.1.0-rc.4';
export const RELEASE_CHANNEL = 'release-candidate';
export const API_CONTRACT_VERSION = '1.0';
export const SYNC_CONTRACT_VERSION = 1;
export const DATABASE_MIGRATION_HEAD = '0004';
export const DEPLOYMENT_PLAN_VERSION = 1;
export const EXPORT_FORMAT_VERSION = 1;
export const LOCAL_STORE_VERSION = 1;

export interface BuildIdentity {
  product: typeof PRODUCT_NAME;
  productVersion: string;
  sourceCommit: string;
  buildTime: string;
  releaseChannel: string;
  deploymentProfile: 'cloudflare' | 'compose' | 'development' | 'test';
  apiContract: string;
  syncContract: number;
  databaseMigration: string;
  deploymentPlan: number;
  exportFormat: number;
  localStore: number;
  artifactIdentity: string;
}

export function createBuildIdentity(
  input: Partial<BuildIdentity> & Pick<BuildIdentity, 'deploymentProfile'>,
): BuildIdentity {
  return {
    product: PRODUCT_NAME,
    productVersion: PRODUCT_VERSION,
    sourceCommit: input.sourceCommit ?? 'development',
    buildTime: input.buildTime ?? 'development',
    releaseChannel: input.releaseChannel ?? RELEASE_CHANNEL,
    deploymentProfile: input.deploymentProfile,
    apiContract: API_CONTRACT_VERSION,
    syncContract: SYNC_CONTRACT_VERSION,
    databaseMigration: DATABASE_MIGRATION_HEAD,
    deploymentPlan: DEPLOYMENT_PLAN_VERSION,
    exportFormat: EXPORT_FORMAT_VERSION,
    localStore: LOCAL_STORE_VERSION,
    artifactIdentity: input.artifactIdentity ?? `${PRODUCT_NAME}@${PRODUCT_VERSION}+development`,
  };
}
