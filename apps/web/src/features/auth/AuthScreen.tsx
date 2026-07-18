import { useState, type FormEvent } from 'react';
import type { SessionView } from '@apiarylens/contracts';
import { api, type BootstrapSession } from '../../api.js';

export function AuthScreen({
  bootstrapAvailable,
  bootstrapTokenRequired,
  offline,
  onAuthenticated,
}: {
  bootstrapAvailable: boolean;
  bootstrapTokenRequired: boolean;
  offline: boolean;
  onAuthenticated: (session: SessionView | BootstrapSession) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const invitationToken = new URLSearchParams(location.search).get('invite');
  const [recovering, setRecovering] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (recovering) {
        await api.recover(
          String(form.get('identifier')),
          String(form.get('recoveryCode')),
          String(form.get('password')),
        );
        setRecovering(false);
        setError('Password updated. Sign in with your new password.');
        return;
      }
      const session = invitationToken
        ? await api.acceptInvitation(invitationToken, String(form.get('password')))
        : bootstrapAvailable
          ? await api.bootstrap({
              identifier: String(form.get('identifier')),
              displayName: String(form.get('displayName')),
              password: String(form.get('password')),
              organizationName: String(form.get('organizationName')),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              ...(bootstrapTokenRequired
                ? { bootstrapToken: String(form.get('bootstrapToken')) }
                : {}),
            })
          : await api.signIn(String(form.get('identifier')), String(form.get('password')));
      await onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">ApiaryLens</span>
        <h1>Your hive history, even beyond the signal.</h1>
        <p>
          Private, family-friendly apiary records that work in the yard and synchronize at home.
        </p>
      </section>
      <form className="card form" onSubmit={(event) => void submit(event)}>
        <h2>
          {invitationToken
            ? 'Join your family apiary'
            : recovering
              ? 'Recover your account'
              : bootstrapAvailable
                ? 'Create your family apiary'
                : 'Welcome back'}
        </h2>
        {offline && <p className="error">Connect once to sign in on this device.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {bootstrapAvailable && !invitationToken && !recovering && (
          <>
            <label>
              Display name
              <input name="displayName" required maxLength={120} autoComplete="name" />
            </label>
            <label>
              Family or apiary name
              <input name="organizationName" required maxLength={120} />
            </label>
            {bootstrapTokenRequired && (
              <label>
                Deployment bootstrap code
                <input name="bootstrapToken" required minLength={20} autoComplete="off" />
                <small>Scout Bee displays this one-time code after deployment.</small>
              </label>
            )}
          </>
        )}
        {!invitationToken && (
          <label>
            Email or username
            <input name="identifier" required minLength={3} autoComplete="username" />
          </label>
        )}
        {recovering && (
          <label>
            Unused recovery code
            <input name="recoveryCode" required minLength={16} autoComplete="off" />
          </label>
        )}
        <label>
          {invitationToken ? 'Create your password' : recovering ? 'New password' : 'Password'}
          <input
            name="password"
            required
            minLength={12}
            type="password"
            autoComplete={
              bootstrapAvailable || invitationToken ? 'new-password' : 'current-password'
            }
          />
          {invitationToken && (
            <small>
              Choose a new password for your ApiaryLens account. Use at least 12 characters.
            </small>
          )}
        </label>
        <button className="button primary" disabled={working || offline}>
          {working
            ? 'Working…'
            : recovering
              ? 'Set new password'
              : invitationToken
                ? 'Accept invitation'
                : bootstrapAvailable
                  ? 'Create secure workspace'
                  : 'Sign in'}
        </button>
        {!bootstrapAvailable && !invitationToken && (
          <button type="button" className="text-button" onClick={() => setRecovering(!recovering)}>
            {recovering ? 'Return to sign in' : 'Use a recovery code'}
          </button>
        )}
      </form>
    </main>
  );
}
