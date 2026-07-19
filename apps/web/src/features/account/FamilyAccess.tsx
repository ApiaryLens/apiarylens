import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api.js';
import { cacheMemberSummary } from '../overview/members-summary.js';

export function FamilyAccess({
  csrfToken,
  organizationId,
}: {
  csrfToken: string;
  organizationId: string;
}) {
  const [members, setMembers] = useState<
    Array<{ id: string; displayName: string; identifier: string; role: string; status: string }>
  >([]);
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      displayName: string;
      identifier: string;
      role: string;
      expiresAt: string;
      createdAt: string;
    }>
  >([]);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState('');

  function invitationLink(token: string): string {
    const url = new URL(location.origin);
    url.searchParams.set('invite', token);
    return url.toString();
  }

  async function refreshAccess() {
    const [memberResult, invitationResult] = await Promise.all([api.members(), api.invitations()]);
    setMembers(memberResult.items);
    setInvitations(invitationResult.items);
    // Keep the offline-aware Overview Members card in step with roster and
    // invitation changes.
    await cacheMemberSummary(organizationId, memberResult.items, invitationResult.items);
  }

  useEffect(() => {
    void refreshAccess().catch(() => setError('Could not load family access.'));
  }, []);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const invitation = await api.invite(csrfToken, {
        displayName: String(data.get('displayName')),
        identifier: String(data.get('identifier')),
        role: String(data.get('role')) as 'beekeeper' | 'viewer',
      });
      setInvitationUrl(invitationLink(invitation.token));
      await refreshAccess();
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create invitation');
    }
  }

  async function removeMember(member: { id: string; displayName: string }) {
    if (!confirm(`Remove ${member.displayName} from this family and sign out their devices?`))
      return;
    setWorkingId(member.id);
    setError('');
    try {
      await api.revokeMember(csrfToken, member.id);
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove family member');
    } finally {
      setWorkingId('');
    }
  }

  async function revokeInvitation(invitationId: string) {
    setWorkingId(invitationId);
    setError('');
    try {
      await api.revokeInvitation(csrfToken, invitationId);
      setInvitationUrl('');
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke invitation');
    } finally {
      setWorkingId('');
    }
  }

  async function replaceInvitation(invitationId: string) {
    setWorkingId(invitationId);
    setError('');
    try {
      const replacement = await api.replaceInvitation(csrfToken, invitationId);
      setInvitationUrl(invitationLink(replacement.token));
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not replace invitation');
    } finally {
      setWorkingId('');
    }
  }
  return (
    <section className="card family-access">
      <h2>Family access</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>{member.identifier}</small>
            </span>
            <span className="member-actions">
              <span>{member.role}</span>
              {member.role !== 'owner' && member.status === 'active' && (
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === member.id}
                  onClick={() => void removeMember(member)}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <h3>Pending invitations</h3>
      {invitations.length === 0 ? (
        <p>No pending invitations.</p>
      ) : (
        <ul className="member-list">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <span>
                <strong>{invitation.displayName}</strong>
                <small>
                  {invitation.identifier} · expires{' '}
                  {new Date(invitation.expiresAt).toLocaleString()}
                </small>
              </span>
              <span className="member-actions">
                <span>{invitation.role}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invitation.id}
                  onClick={() => void replaceInvitation(invitation.id)}
                >
                  Replace link
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invitation.id}
                  onClick={() => void revokeInvitation(invitation.id)}
                >
                  Revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="form compact" onSubmit={(event) => void invite(event)}>
        <h3>Invite someone</h3>
        <label>
          Name
          <input name="displayName" required />
        </label>
        <label>
          Email or username
          <input name="identifier" required />
        </label>
        <label>
          Role
          <select name="role">
            <option value="beekeeper">Beekeeper — can add and edit records</option>
            <option value="viewer">Viewer — read only</option>
          </select>
        </label>
        <button className="button primary">Create 48-hour invitation</button>
      </form>
      {invitationUrl && (
        <div className="invite-result">
          <strong>Share this invitation privately:</strong>
          <input readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
    </section>
  );
}
