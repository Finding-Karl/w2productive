/**
 * Serialize read-modify-write of local state. E.g. the session-end alarm, a Stop click and
 * a sync merge can land together; without this they'd each read the same snapshot and the
 * last write would drop the others' changes. The promise chain only orders work within one
 * worker lifetime — no state lives in it.
 */
let queue: Promise<unknown> = Promise.resolve();

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
