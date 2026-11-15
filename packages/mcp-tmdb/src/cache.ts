export class Cache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(
    private ttl: number,
    private capacity: number,
    private now = Date.now,
  ) {}
  get(key: string): T | undefined {
    this.prune();
    return this.entries.get(key)?.value;
  }
  private prune() {
    for (const [key, entry] of this.entries)
      if (entry.expires <= this.now()) this.entries.delete(key);
  }
  set(key: string, value: T) {
    this.prune();
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expires: this.now() + this.ttl });
  }
  clear() {
    this.entries.clear();
  }
}
