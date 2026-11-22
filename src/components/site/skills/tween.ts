/**
 * A tiny tween engine (stands in for gsap). Tweens are advanced by the
 * renderer's own clock, so they pause with it when the section is offscreen.
 */

export type Ease = (t: number) => number;

export const power3Out: Ease = (t) => 1 - (1 - t) ** 3;
export const power4Out: Ease = (t) => 1 - (1 - t) ** 4;
export const expoInOut: Ease = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;

type Target = Record<string, number>;
type Tween = {
  obj: Target;
  key: string;
  from: number;
  to: number;
  start: number;
  duration: number;
  ease: Ease;
  started: boolean;
  onComplete?: () => void;
};

export type TweenOptions = { duration: number; delay?: number; ease?: Ease; onComplete?: () => void };

export class Tweener {
  private list: Tween[] = [];
  private time = 0;

  /** Animates `obj`'s numeric props to `props`; replaces running tweens of the same props. */
  to<T extends object>(obj: T, props: Partial<Record<keyof T, number>>, { duration, delay = 0, ease = power3Out, onComplete }: TweenOptions) {
    const target = obj as unknown as Target;
    const keys = Object.keys(props);
    this.list = this.list.filter((t) => t.obj !== target || !keys.includes(t.key));
    keys.forEach((key, i) => {
      this.list.push({
        obj: target,
        key,
        from: 0,
        to: (props as Record<string, number>)[key],
        start: this.time + delay,
        duration: Math.max(0, duration),
        ease,
        started: false,
        onComplete: i === keys.length - 1 ? onComplete : undefined,
      });
    });
  }

  /** Calls `fn` after `delay` seconds of renderer time. */
  call(delay: number, fn: () => void) {
    this.to({ v: 0 }, { v: 1 }, { duration: 0, delay, onComplete: fn });
  }

  update(dt: number) {
    this.time += dt;
    if (!this.list.length) return;
    const done: Tween[] = [];
    for (const t of this.list) {
      if (this.time < t.start) continue;
      if (!t.started) {
        t.started = true;
        t.from = t.obj[t.key];
      }
      const p = t.duration ? Math.min(1, (this.time - t.start) / t.duration) : 1;
      t.obj[t.key] = t.from + (t.to - t.from) * t.ease(p);
      if (p >= 1) done.push(t);
    }
    if (!done.length) return;
    this.list = this.list.filter((t) => !done.includes(t));
    for (const t of done) t.onComplete?.();
  }

  get active() {
    return this.list.length > 0;
  }

  clear() {
    this.list = [];
  }
}
