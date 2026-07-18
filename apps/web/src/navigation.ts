export type Page = 'dashboard' | 'apiaries' | 'hives' | 'inspections' | 'care' | 'version';

export type HiveStatusFilter = 'all' | 'active' | 'archived';
export type CareView = 'all' | 'open-follow-ups';

/**
 * A navigation request from an Overview card or list row. The optional fields
 * pre-filter the destination; plain bottom-nav navigation omits them.
 */
export interface PageRequest {
  page: Page;
  hiveStatus?: HiveStatusFilter;
  careView?: CareView;
  hiveId?: string;
}
