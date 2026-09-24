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
