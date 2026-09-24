import { useEffect, useState } from 'react';
import type { WxtStorageItem } from '#imports';

/** Live value of a storage item; undefined until the first read resolves. */
export function useStorageItem<T>(item: WxtStorageItem<T, any>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let alive = true;
    item.getValue().then((v) => alive && setValue(v));
    const unwatch = item.watch((v) => setValue(v));
    return () => {
      alive = false;
      unwatch();
    };
  }, [item]);
  return value;
}

/** Re-renders every `ms` while `active`. UI-only ticking; never used for stored state. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}
