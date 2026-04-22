/**
 * Cap concurrent in-flight tasks per key (e.g. per model id) on top of a global
 * concurrency pool. Prevents any one model's rate limit from starving the pool
 * while other models have headroom.
 */

export class PerKeySemaphore {
	private active = new Map<string, number>();
	private waiters = new Map<string, Array<() => void>>();

	constructor(private readonly perKeyLimit: number) {}

	async acquire(key: string): Promise<() => void> {
		const current = this.active.get(key) ?? 0;
		if (current < this.perKeyLimit) {
			this.active.set(key, current + 1);
		} else {
			await new Promise<void>((resolve) => {
				if (!this.waiters.has(key)) this.waiters.set(key, []);
				this.waiters.get(key)!.push(resolve);
			});
			// Slot was handed to us directly by release(); `active` already reflects us.
		}
		return () => this.release(key);
	}

	private release(key: string): void {
		const queue = this.waiters.get(key);
		if (queue && queue.length > 0) {
			const next = queue.shift()!;
			next();
		} else {
			const current = this.active.get(key) ?? 1;
			this.active.set(key, current - 1);
		}
	}
}
