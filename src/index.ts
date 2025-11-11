import { EmitterLikeBase } from "@infra-blocks/emitter";
import { timer } from "@infra-blocks/timer";
import type { Predicate } from "@infra-blocks/types";

/**
 * A batch of items.
 *
 * Synonym for ReadonlyArray<T>.
 */
export type Batch<T> = ReadonlyArray<T>;

/**
 * Events emitted by the Batcher.
 */
export type BatcherEvents<T> = {
  /**
   * Emitted when a batch is flushed.
   *
   * The handler is called with the batch that has been accumulated so far
   * until the {@link Batcher.flush} method is called. The handler receives
   * the batch as argument and the Batcher's internal state has already been
   * reset.
   *
   * @param batch - The batch that was accumulated so far.
   */
  flush: (batch: Batch<T>) => void;
  /**
   * Emitted when an item is pushed to the batcher.
   *
   * This happens *after* the item has been appended to the batcher's internal buffer.
   * This listener, in combination to the "flush" event listener,  is useful to set up
   * rules by which the batcher should flush items.
   *
   * For example, a batcher that should flush every 20 items can be implemented as such:
   * ```ts
   * const batcher = Batcher.create<MyItemType>();
   * let count = 0;
   * batcher.on("push", () => {
   *  count++;
   *  if (count >= 20) {
   *    batcher.flush();
   *  }
   * }).on("flush", () => {
   *  count = 0;
   * });
   * ```
   *
   * @param item - The item that was just pushed to the batcher.
   */
  push: (item: T) => void;
};

/**
 * A utility class that stores and accumulates items until the {@link Batcher.flush} method
 * is invoked.
 *
 * In other words, it is a specialized event emitter that comes packaged with an internal buffer.
 * See {@link BatcherEvents} for a description of the events emitted by this class.
 *
 * @see BatcherEvents
 */
export class Batcher<T> extends EmitterLikeBase<BatcherEvents<T>> {
  private _items: T[];

  private constructor() {
    super();
    this._items = [];
  }

  /**
   * @returns Whether the batcher has any items.
   */
  isEmpty(): boolean {
    return this._items.length === 0;
  }

  /**
   * @returns A read-only view of the items accumulated so far.
   */
  items(): ReadonlyArray<T> {
    return this._items;
  }

  /**
   * Pushes an item to the internal batcher buffer, then emits the "push" event.
   *
   * @param item - The item to push to the batcher.
   */
  push(item: T): void {
    this._items.push(item);
    this.emit("push", item);
  }

  /**
   * Resets the internal buffer and emits the "flush" event with the items
   * that were accumulated before this function was called.
   *
   * Does nothing if the buffer is empty.
   */
  flush(): void {
    const batch = this._items;
    this._items = [];
    this.emit("flush", batch);
  }

  /**
   * @returns The number of items accumulated so far.
   */
  size(): number {
    return this._items.length;
  }

  /**
   * Configures the batcher to flush automatically when the size reaches the provided
   * threshold.
   *
   * The threshold is inclusive and the minimum allowed value is 1. 1 results in the
   * batcher flushing on every push.
   *
   * @param size - The maximum size the batcher can reach before immediately flushing.
   *
   * @returns This instance.
   */
  flushAtSize(size: number): this {
    if (size < 1) {
      throw new RangeError("size must be >= 1");
    }
    return this.flushWhenTrue((b) => b.size() >= size);
  }

  /**
   * Configures the batcher to flush when the provided predicate returns true.
   *
   * @param predicate - A predicate that receives this batcher as argument and
   * returns whether to flush or not.
   *
   * @returns This instance.
   */
  flushWhenTrue(predicate: Predicate<Batcher<T>>): this {
    this.on("push", () => {
      if (predicate(this)) {
        this.flush();
      }
    });
    return this;
  }

  /**
   * Configures a period within which the batcher must flush at least once.
   *
   * Effectively, it sets a timer between every flushes with the specificed interval.
   * When the timer expires, the batcher flushes. Optionally, the user
   * can elect not to flush empty batches on timer expiration.
   *
   * When the batcher flushes, *for whatever reason*, the timer is restarted.
   *
   * @param intervalMs The interval, in milliseconds, at which to flush the batcher.
   * @param options.skipEmpty Whether to skip empty batches. Default: `false`.
   */
  flushAtLeastEvery(
    intervalMs: number,
    options?: { skipEmpty?: boolean },
  ): this {
    const t = timer(intervalMs);
    const { skipEmpty = false } = options || {};
    this.on("flush", () => {
      t.restart();
    });
    const alwaysFlush = () => {
      this.flush();
    };
    const flushOnlyIfNotEmpty = () => {
      if (!this.isEmpty()) {
        this.flush();
      } else {
        t.restart();
      }
    };
    if (skipEmpty) {
      t.on("timeout", flushOnlyIfNotEmpty);
    } else {
      t.on("timeout", alwaysFlush);
    }
    this.on("flush", () => {
      t.restart();
    });
    t.start();
    return this;
  }

  /**
   * Returns an empty batcher without listeners.
   *
   * @returns A new instance of the Batcher class.
   */
  static create<T>(): Batcher<T> {
    return new Batcher<T>();
  }
}
