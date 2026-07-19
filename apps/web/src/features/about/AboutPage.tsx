import { frontendBuild, windowsPackageLabel } from '../../build-identity.js';
import { useGlossary } from '../glossary/glossary-context.js';
import {
  documentationLinks,
  publicPreviewName,
  releaseLinks,
  type ExternalLink,
} from './about-data.js';

/**
 * Owner-directed About page (T2 addition, 2026-07-18): product identity,
 * release information, documentation, and how-tos. The page renders fully
 * offline — identity comes from the baked-in build identity and the glossary
 * is the always-available in-app reference; external links are disabled with
 * an honest note while offline instead of being left as broken clicks.
 */
export function AboutPage({ offline }: { offline: boolean }) {
  const glossary = useGlossary();
  return (
    <>
      <div className="page-h">
        <h1>About ApiaryLens</h1>
        <span className="sub">
          {publicPreviewName} · build {frontendBuild.productVersion}
        </span>
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="panel-h">
            <h2>Product identity</h2>
          </div>
          <div className="panel-b">
            <dl className="kv">
              <dt>Product</dt>
              <dd>ApiaryLens — private, offline-first apiary management</dd>
              <dt>Public preview</dt>
              <dd>
                {publicPreviewName} <span className="tag warn">NOT YET GA</span>
              </dd>
              <dt>Build</dt>
              <dd className="mono">{frontendBuild.productVersion}</dd>
              <dt>Source commit</dt>
              <dd className="mono">{frontendBuild.sourceCommit}</dd>
              <dt>Build time</dt>
              <dd className="mono">{frontendBuild.buildTime}</dd>
              <dt>Profile</dt>
              <dd>{frontendBuild.deploymentProfile}</dd>
              <dt>License</dt>
              <dd>Apache-2.0 (full license report ships with each release)</dd>
            </dl>
            {windowsPackageLabel && (
              <p className="sub-t" style={{ marginBottom: 0 }}>
                {windowsPackageLabel}
              </p>
            )}
          </div>
          <div className="panel-note">
            <span className="sub-t">
              Features and workflows may change during the preview; keep current backups. The
              Account page has the full build and deployment detail.
            </span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Release information</h2>
            <span className="spacer"></span>
            {offline && <span className="tag mut">OFFLINE — LINKS DISABLED</span>}
          </div>
          <ExternalLinkList links={releaseLinks(frontendBuild.productVersion)} offline={offline} />
        </div>
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="panel-h">
            <h2>Documentation &amp; how-tos</h2>
            <span className="spacer"></span>
            {offline && <span className="tag mut">OFFLINE — LINKS DISABLED</span>}
          </div>
          <ExternalLinkList links={documentationLinks} offline={offline} />
        </div>

        <div className="panel">
          <div className="panel-h">
            <h2>Always available offline</h2>
          </div>
          <div className="panel-b">
            <p className="sub-t" style={{ marginTop: 0 }}>
              The beekeeping glossary ships inside the app, so the reference works in the yard with
              no connection at all.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => glossary.open()}
              aria-haspopup="dialog"
            >
              Open the beekeeping glossary
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ExternalLinkList({ links, offline }: { links: ExternalLink[]; offline: boolean }) {
  return (
    <div className="panel-b">
      <ul className="about-links">
        {links.map((link) => (
          <li key={link.href}>
            {offline ? (
              <span className="about-link-disabled" aria-disabled="true">
                {link.label}
              </span>
            ) : (
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            )}
            <span className="sub-t">{link.detail}</span>
          </li>
        ))}
      </ul>
      {offline && (
        <p className="sub-t" style={{ marginBottom: 0 }}>
          These pages live on the web. They will open once this device is back online — nothing on
          this page itself needs a connection.
        </p>
      )}
    </div>
  );
}
