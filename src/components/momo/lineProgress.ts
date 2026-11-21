/** Per-frame karaoke progress, kept outside React so narration causes no re-renders. */
const values = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

export const getLineProgress = (id: string) => values.get(id) ?? 0;

export function setLineProgress(id: string, progress: number) {
  values.set(id, progress);
  listeners.get(id)?.forEach((fn) => fn());
}

export function subscribeLineProgress(id: string, fn: () => void) {
  const set = listeners.get(id) ?? new Set();
  listeners.set(id, set);
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}
