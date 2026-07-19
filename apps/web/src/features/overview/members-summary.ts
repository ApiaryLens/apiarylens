import { db } from '../../db.js';

/**
 * Offline-aware Overview support for the family Members block (FB-006 leftover
 * flagged at WIN-032 closure). The card never fabricates a count: a number is
 * shown only after this device has read the roster from a live session, and it
 * is always labeled with how fresh that reading is. Devices that have never
 * synchronized the roster get an honest "not synced yet" state instead of a
 * misleading zero.
 */
export type MemberSummary = {
  activeMembers: number;
  invitedMembers: number;
  fetchedAt: string;
};

type MemberLike = { status: string };

function summaryKey(organizationId: string): string {
  return `memberSummary:${organizationId}`;
}

export function summarizeMembers(items: readonly MemberLike[]): {
  activeMembers: number;
  invitedMembers: number;
} {
  return {
    activeMembers: items.filter((item) => item.status === 'active').length,
    invitedMembers: items.filter((item) => item.status === 'invited').length,
  };
}

export async function cacheMemberSummary(
  organizationId: string,
  items: readonly MemberLike[],
  fetchedAt = new Date().toISOString(),
): Promise<MemberSummary> {
  const summary: MemberSummary = { ...summarizeMembers(items), fetchedAt };
  await db.settings.put({ key: summaryKey(organizationId), value: summary });
  return summary;
}

export async function cachedMemberSummary(
  organizationId: string,
): Promise<MemberSummary | undefined> {
  const value = (await db.settings.get(summaryKey(organizationId)))?.value;
  if (!value || typeof value !== 'object') return undefined;
  const summary = value as Partial<MemberSummary>;
  if (
    typeof summary.activeMembers !== 'number' ||
    typeof summary.invitedMembers !== 'number' ||
    typeof summary.fetchedAt !== 'string'
  )
    return undefined;
  return summary as MemberSummary;
}

/**
 * Honest staleness wording for the Members card. The reading time is always
 * disclosed so an offline device never presents a cached roster as current.
 */
export function memberSummaryFreshness(fetchedAt: string, now: Date = new Date()): string {
  const readAt = new Date(fetchedAt).getTime();
  if (!Number.isFinite(readAt)) return 'Last synced time unknown';
  const elapsedMinutes = Math.floor((now.getTime() - readAt) / 60_000);
  if (elapsedMinutes < 2) return 'Synced just now';
  if (elapsedMinutes < 60) return `Synced ${elapsedMinutes} minutes ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Synced ${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays <= 7) return `Synced ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
  return `Synced ${new Date(readAt).toLocaleDateString()}`;
}
