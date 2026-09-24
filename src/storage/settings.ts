import { storage } from '#imports';

export type EnforcementMode = 'normal' | 'hardcore';
export type ListMode = 'blocklist' | 'allowlist';

export interface Settings {
  enforcementMode: EnforcementMode;
  listMode: ListMode;
  blocklist: string[]; // hostnames, e.g. "youtube.com"
  allowlist: string[];
  /** Minutes of credit earned per 60 minutes of focus. */
  earnMinutesPerHour: number;
  /** Sessions shorter than this earn nothing. */
  minSessionMinutes: number;
  sessionPresets: number[]; // minutes
  rolloverHour: number; // 0–23, local time
  vault: {
    rolloverPercent: number; // 0–100
    maxMinutes: number | null; // null = unlimited
    dailyWithdrawLimitMinutes: number | null;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  enforcementMode: 'normal',
  listMode: 'blocklist',
  blocklist: ['youtube.com', 'reddit.com', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com'],
  allowlist: [],
  earnMinutesPerHour: 20,
  minSessionMinutes: 10,
  sessionPresets: [25, 50],
  rolloverHour: 4,
  vault: { rolloverPercent: 100, maxMinutes: null, dailyWithdrawLimitMinutes: null },
};

/**
 * Versioned item: bump `version` and add a `migrations` entry when the shape changes.
 * Pending (24h-delayed) loosening changes will live in a separate item, not here.
 */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 1,
});
