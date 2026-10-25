// A bounded cache that forgets the least recently used entry. A Map keeps insertion order, so re-inserting on a hit is
// all the bookkeeping there is. The zone keeps its lot blueprints in one: building is deterministic, so an entry that
// was forgotten is simply built again, and the size only trades memory for time.
export class Lru<K, V> {
  private readonly map = new Map<K, V>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError(`An LRU needs room for at least one entry, got ${capacity}`);
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as K);
  }

  clear(): void {
    this.map.clear();
  }
}
