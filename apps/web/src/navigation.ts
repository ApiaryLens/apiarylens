export type Page =
  'dashboard' | 'apiaries' | 'apiary' | 'hives' | 'hive' | 'inspections' | 'care' | 'version';

export type HiveStatusFilter = 'all' | 'active' | 'archived';
export type CareView = 'all' | 'open-follow-ups';
export type AccountSection = 'account' | 'members' | 'backup';

/**
 * A navigation request from the sidebar, an Overview card, or a table row.
 * The optional fields pre-filter or target the destination; plain navigation
 * omits them. 'hive' and 'apiary' are the V2 detail screens and require their
 * id fields.
 */
export interface PageRequest {
  page: Page;
  hiveStatus?: HiveStatusFilter;
  careView?: CareView;
  hiveId?: string;
  apiaryId?: string;
  /** Which Administration section to reveal on the account page. */
  accountSection?: AccountSection;
}

/** The sidebar entry that should light up for the page being shown. */
export function sidebarTarget(page: Page): Page {
  if (page === 'hive') return 'hives';
  if (page === 'apiary') return 'apiaries';
  return page;
}

export const pageTitles: Record<Page, string> = {
  dashboard: 'Overview',
  apiaries: 'Apiaries',
  apiary: 'Apiary',
  hives: 'Hives',
  hive: 'Hive',
  inspections: 'Inspections',
  care: 'Care',
  version: 'Account',
};
