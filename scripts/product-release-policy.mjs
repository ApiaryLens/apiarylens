import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const asBoolean = (value) => String(value).toLowerCase() === 'true';

export function resolveProductReleasePolicy({
  version,
  exactTag,
  allowUnsignedPreview = false,
  signingMaterialAvailable = false,
}) {
  const expectedTag = `v${version}`;
  if (exactTag !== expectedTag) {
    throw new Error(`Release tag ${exactTag || '<missing>'} does not match ${expectedTag}.`);
  }
  const channel = version.includes('-preview.')
    ? 'preview'
    : version.includes('-rc.')
      ? 'release-candidate'
      : version.includes('-')
        ? 'unsupported'
        : 'stable';
  if (!['preview', 'release-candidate', 'stable'].includes(channel)) {
    throw new Error(`Unsupported product release version: ${version}.`);
  }
  if (signingMaterialAvailable) {
    return {
      version,
      exactTag,
      channel,
      signingMode: 'signed',
      explicitUnsignedPreviewOptIn: false,
    };
  }
  if (channel === 'preview' && allowUnsignedPreview) {
    return {
      version,
      exactTag,
      channel,
      signingMode: 'unsigned-preview',
      explicitUnsignedPreviewOptIn: true,
    };
  }
  throw new Error(
    channel === 'preview'
      ? 'Windows signing secrets are absent. An unsigned Preview requires an explicit manual allow_unsigned_preview opt-in for the exact tag.'
      : `${channel} releases require Authenticode signing material and cannot be published unsigned.`,
  );
}

function run() {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const policy = resolveProductReleasePolicy({
    version,
    exactTag: process.env.APIARYLENS_EXACT_TAG,
    allowUnsignedPreview: asBoolean(process.env.APIARYLENS_ALLOW_UNSIGNED_PREVIEW),
    signingMaterialAvailable: asBoolean(process.env.APIARYLENS_WINDOWS_SIGNING_AVAILABLE),
  });
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${policy.version}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `exact_tag=${policy.exactTag}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `channel=${policy.channel}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `signing_mode=${policy.signingMode}\n`);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `explicit_unsigned_preview_opt_in=${policy.explicitUnsignedPreviewOptIn}\n`,
    );
  }
  process.stdout.write(
    `ApiaryLens ${policy.version} release policy: ${policy.channel}, ${policy.signingMode}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
