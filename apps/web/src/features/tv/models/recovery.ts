type Schedule = (callback: () => void, delay: number) => () => void;
const defaultSchedule: Schedule = (callback, delay) => {
  const id = setTimeout(callback, delay);
  return () => clearTimeout(id);
};
/** One budget per playback target; transient playing events cannot create infinite retries. */
export class PlaybackRecovery {
  count = 0;
  private cancel?: () => void;
  private disposed = false;
  constructor(
    private retry: (attempt: number) => void,
    private schedule: Schedule = defaultSchedule,
  ) {}
  fail() {
    if (this.disposed) return false;
    if (this.cancel) return true;
    if (this.count >= 5) return false;
    const attempt = ++this.count;
    this.cancel = this.schedule(
      () => {
        this.cancel = undefined;
        if (!this.disposed) this.retry(attempt);
      },
      Math.min(10000, 1000 * 2 ** (attempt - 1)),
    );
    return true;
  }
  playing() {
    this.cancel?.();
    this.cancel = undefined;
  }
  reset() {
    this.playing();
    this.count = 0;
  }
  dispose() {
    this.playing();
    this.disposed = true;
  }
}
