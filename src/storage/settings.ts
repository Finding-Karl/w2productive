import { storage } from '#imports';
import { DEEP_FOCUS_DEFAULTS, type DeepFocusParams } from '@/src/core/deepFocus';

export type EnforcementMode = 'normal' | 'hardcore';
export type ListMode = 'blocklist' | 'allowlist';

export interface Settings {
  enforcementMode: EnforcementMode;
  listMode: ListMode;
  blocklist: string[]; // hostnames, e.g. "youtube.com"
  allowlist: string[];
  /** Minutes of credit earned per 60 minutes of focus. */
  earnMinutesPerHour: number;
  /** Ending early earns nothing until this % of the planned length is focused. */
  minSessionPercent: number;
  sessionPresets: number[]; // minutes
  rolloverHour: number; // 0–23, local time
  vault: {
    rolloverPercent: number; // 0–100
    maxMinutes: number | null; // null = unlimited
    dailyWithdrawLimitMinutes: number | null;
  };
  /** Your defaults for deep focus checks. Your group/collectives can only make them stricter. */
  deepFocus: DeepFocusParams;
}

export const DEFAULT_SETTINGS: Settings = {
  enforcementMode: 'normal',
  listMode: 'blocklist',
  blocklist: ['youtube.com', 'reddit.com', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com'],
  allowlist: [],
  earnMinutesPerHour: 20,
  minSessionPercent: 50,
  sessionPresets: [10, 30, 60, 90, 120],
  rolloverHour: 4,
  vault: { rolloverPercent: 100, maxMinutes: null, dailyWithdrawLimitMinutes: null },
  deepFocus: DEEP_FOCUS_DEFAULTS,
};

/**
 * Versioned item: bump `version` and add a `migrations` entry when the shape changes.
 * Pending (24h-delayed) loosening changes will live in a separate item, not here.
 */
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 2,
  migrations: {
    // v2: deep focus defaults. Fill anything missing from defaults so older saves stay valid.
    2: (old: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...old, deepFocus: old.deepFocus ?? DEEP_FOCUS_DEFAULTS }),
  },
});
