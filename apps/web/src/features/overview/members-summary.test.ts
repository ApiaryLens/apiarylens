import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import {
  cacheMemberSummary,
  cachedMemberSummary,
  memberSummaryFreshness,
  summarizeMembers,
} from './members-summary.js';

describe('offline-aware Members overview summary', () => {
  afterEach(async () => {
    await db.settings.clear();
  });

  it('counts active members and combines invited memberships with pending invitations', () => {
    expect(
      summarizeMembers(
        [{ status: 'active' }, { status: 'active' }, { status: 'invited' }, { status: 'revoked' }],
        [{ id: 'invitation-1' }],
      ),
    ).toEqual({ activeMembers: 2, invitedMembers: 2 });
    expect(summarizeMembers([], [])).toEqual({ activeMembers: 0, invitedMembers: 0 });
  });

  it('records unknown invitations as null, never as a false zero', () => {
    // A beekeeper or viewer session cannot read the invitations route; the
    // summary must not claim there are no pending invitations.
    expect(summarizeMembers([{ status: 'active' }])).toEqual({
      activeMembers: 1,
      invitedMembers: null,
    });
  });

  it('returns no summary for a device that has never read the roster', async () => {
    expect(await cachedMemberSummary(crypto.randomUUID())).toBeUndefined();
  });

  it('caches a roster reading per organization with its reading time', async () => {
    const organizationId = crypto.randomUUID();
    const otherOrganization = crypto.randomUUID();
    await cacheMemberSummary(
      organizationId,
      [{ status: 'active' }, { status: 'invited' }],
      [{ id: 'invitation-1' }, { id: 'invitation-2' }],
      '2026-07-18T10:00:00.000Z',
    );

    expect(await cachedMemberSummary(organizationId)).toEqual({
      activeMembers: 1,
      invitedMembers: 3,
      fetchedAt: '2026-07-18T10:00:00.000Z',
    });
    expect(await cachedMemberSummary(otherOrganization)).toBeUndefined();
  });

  it('round-trips an unknown invitation count', async () => {
    const organizationId = crypto.randomUUID();
    await cacheMemberSummary(
      organizationId,
      [{ status: 'active' }],
      undefined,
      '2026-07-18T10:00:00.000Z',
    );
    expect(await cachedMemberSummary(organizationId)).toEqual({
      activeMembers: 1,
      invitedMembers: null,
      fetchedAt: '2026-07-18T10:00:00.000Z',
    });
  });

  it('rejects a malformed cached value instead of showing a misleading count', async () => {
    const organizationId = crypto.randomUUID();
    await db.settings.put({ key: `memberSummary:${organizationId}`, value: { activeMembers: 3 } });
    expect(await cachedMemberSummary(organizationId)).toBeUndefined();
  });

  it('always discloses how fresh the roster reading is', () => {
    const now = new Date('2026-07-18T12:00:00.000Z');
    expect(memberSummaryFreshness('2026-07-18T11:59:30.000Z', now)).toBe('Synced just now');
    expect(memberSummaryFreshness('2026-07-18T11:15:00.000Z', now)).toBe('Synced 45 minutes ago');
    expect(memberSummaryFreshness('2026-07-18T09:00:00.000Z', now)).toBe('Synced 3 hours ago');
    expect(memberSummaryFreshness('2026-07-17T09:00:00.000Z', now)).toBe('Synced 1 day ago');
    expect(memberSummaryFreshness('2026-07-13T12:00:00.000Z', now)).toBe('Synced 5 days ago');
    expect(memberSummaryFreshness('not-a-date', now)).toBe('Last synced time unknown');
  });
});
