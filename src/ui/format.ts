/** 1500 -> "25:00", 3725 -> "1:02:05" */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Credit amounts: 20 -> "20 sec", 750 -> "12 min" (floored), 0 -> "0 min". */
export function minutes(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  if (s > 0 && s < 60) return `${s} sec`;
  return `${Math.floor(s / 60)} min`;
}

/** Focus time: 8100 -> "2h 15m", 2700 -> "45m", 30 -> "<1m", 0 -> "0m". */
export function hm(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  if (s <= 0) return '0m';
  if (s < 60) return '<1m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
