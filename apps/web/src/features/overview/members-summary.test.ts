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

  it('counts active and invited members without inventing other states', () => {
    expect(
      summarizeMembers([
        { status: 'active' },
        { status: 'active' },
        { status: 'invited' },
        { status: 'revoked' },
      ]),
    ).toEqual({ activeMembers: 2, invitedMembers: 1 });
    expect(summarizeMembers([])).toEqual({ activeMembers: 0, invitedMembers: 0 });
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
      '2026-07-18T10:00:00.000Z',
    );

    expect(await cachedMemberSummary(organizationId)).toEqual({
      activeMembers: 1,
      invitedMembers: 1,
      fetchedAt: '2026-07-18T10:00:00.000Z',
    });
    expect(await cachedMemberSummary(otherOrganization)).toBeUndefined();
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
