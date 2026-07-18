import { useState } from 'react';
import { api } from '../../api.js';
import type { ActiveSession } from '../../session.js';

function currentClientDescription(): string {
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Firefox/')
      ? 'Firefox'
      : userAgent.includes('CriOS') || userAgent.includes('Chrome/')
        ? 'Chrome'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Web browser';
  const platform = /iPad/.test(userAgent)
    ? 'iPad'
    : /iPhone/.test(userAgent)
      ? 'iPhone'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : 'this device';
  const installed = matchMedia('(display-mode: standalone)').matches ? 'installed app' : 'browser';
  return `${browser} on ${platform} · ${installed}`;
}

export function SessionTransparency({ session }: { session: ActiveSession }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const expired = Date.parse(session.expiresAt) <= Date.now();
  async function revokeOthers() {
    if (!session.csrfToken) {
      setMessage(
        'Reconnect and sign in before changing sessions. Your offline records remain here.',
      );
      return;
    }
    if (!confirm('Sign out every other browser and installed app using this account?')) return;
    setWorking(true);
    try {
      const result = await api.revokeOtherSessions(session.csrfToken);
      setMessage(
        result.revoked === 0
          ? 'No other active sessions were found.'
          : `${result.revoked} other session${result.revoked === 1 ? '' : 's'} signed out.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not revoke other sessions.');
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="card session-transparency">
      <div>
        <p className="eyebrow">Current sign-in</p>
        <h2>Device and session</h2>
        <p>
          The server sign-in is held in a secure browser cookie that application code cannot read.
          ApiaryLens caches only non-secret account context and synchronized records for offline
          use.
        </p>
      </div>
      <dl>
        <dt>Current client</dt>
        <dd>{currentClientDescription()}</dd>
        <dt>Server session</dt>
        <dd>
          {session.csrfToken
            ? `Connected · expires ${new Date(session.expiresAt).toLocaleString()}`
            : expired
              ? 'Expired while offline · sign in after reconnecting to synchronize'
              : 'Offline working session · reconnect to validate and synchronize'}
        </dd>
        <dt>Reconnect behavior</dt>
        <dd>
          Records remain usable offline. When connectivity returns, ApiaryLens validates the secure
          cookie and synchronizes automatically; it asks you to sign in only if the server session
          expired or was revoked.
        </dd>
      </dl>
      <div className="button-row">
        <button className="button secondary" disabled={working} onClick={() => void revokeOthers()}>
          {working ? 'Signing out…' : 'Sign out other devices'}
        </button>
      </div>
      {message && (
        <p className="field-hint" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
