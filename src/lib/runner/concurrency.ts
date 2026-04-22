/**
 * Bounded concurrency utilities for parallel task execution.
 *
 * Use these instead of unbounded Promise.all() when:
 * - Tasks involve external API calls (LLMs, databases)
 * - Task count is variable/unbounded
 * - You need to respect rate limits
 */

export interface ConcurrencyResult<T> {
	/** Results in original order (undefined for failed tasks if continueOnError) */
	results: T[];
	/** Errors keyed by index */
	errors: Map<number, Error>;
	/** Number of successful tasks */
	successCount: number;
	/** Number of failed tasks */
	errorCount: number;
}

export interface ConcurrencyOptions {
	/**
	 * Continue processing remaining tasks if one fails.
	 * Default: true
	 */
	continueOnError?: boolean;

	/**
	 * Callback for progress updates.
	 * Called after each task completes (success or failure).
	 */
	onProgress?: (completed: number, total: number, lastError?: Error) => void;
}

/**
 * Execute tasks with bounded concurrency, preserving result order.
 *
 * Unlike Promise.all(), this:
 * - Limits concurrent executions to maxConcurrency
 * - Optionally continues on errors (collecting them separately)
 * - Maintains result order matching input order
 * - Provides progress callbacks
 *
 * @example
 * ```typescript
 * const conversations = [...]; // 100 items
 * const results = await runWithConcurrency(
 *   conversations.map(conv => () => analyzer.analyze(conv)),
 *   10 // max 10 concurrent
 * );
 * ```
 */
export async function runWithConcurrency<T>(
	tasks: (() => Promise<T>)[],
	maxConcurrency: number,
	options: ConcurrencyOptions = {},
): Promise<ConcurrencyResult<T>> {
	const { continueOnError = true, onProgress } = options;

	const results: T[] = new Array(tasks.length);
	const errors = new Map<number, Error>();
	let nextIndex = 0;
	let completedCount = 0;

	async function runNext(): Promise<void> {
		while (nextIndex < tasks.length) {
			const currentIndex = nextIndex++;
			const task = tasks[currentIndex];

			try {
				results[currentIndex] = await task();
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				errors.set(currentIndex, err);

				if (!continueOnError) {
					throw err;
				}

				onProgress?.(++completedCount, tasks.length, err);
				continue;
			}

			onProgress?.(++completedCount, tasks.length);
		}
	}

	const workerCount = Math.min(maxConcurrency, tasks.length);
	const workers = Array(workerCount)
		.fill(null)
		.map(() => runNext());

	await Promise.all(workers);

	return {
		results,
		errors,
		successCount: tasks.length - errors.size,
		errorCount: errors.size,
	};
}

/**
 * Simple version that throws on first error (like Promise.all but bounded).
 *
 * Use this when you want fail-fast behavior with concurrency control.
 */
export async function runWithConcurrencyStrict<T>(
	tasks: (() => Promise<T>)[],
	maxConcurrency: number,
): Promise<T[]> {
	const result = await runWithConcurrency(tasks, maxConcurrency, {
		continueOnError: false,
	});

	if (result.errors.size > 0) {
		const firstEntry = result.errors.entries().next();
		if (!firstEntry.done) {
			throw firstEntry.value[1];
		}
	}

	return result.results;
}

/**
 * Map over items with bounded concurrency.
 *
 * Convenience wrapper around runWithConcurrency for the common case
 * of mapping items to async operations.
 *
 * @example
 * ```typescript
 * const analyzed = await mapWithConcurrency(
 *   conversations,
 *   conv => analyzer.analyze(conv),
 *   10
 * );
 * ```
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	mapper: (item: T, index: number) => Promise<R>,
	maxConcurrency: number,
	options: ConcurrencyOptions = {},
): Promise<ConcurrencyResult<R>> {
	const tasks = items.map((item, index) => () => mapper(item, index));
	return runWithConcurrency(tasks, maxConcurrency, options);
}

// ============================================================================
// TIMEOUT UTILITIES
// ============================================================================

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends Error {
	constructor(message: string, public readonly timeoutMs: number) {
		super(message);
		this.name = 'TimeoutError';
	}
}

/**
 * Wrap a promise with a timeout.
 *
 * If the promise doesn't resolve within timeoutMs, rejects with TimeoutError.
 * The underlying promise continues running (cannot be cancelled), but its
 * result is ignored.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withTimeout(
 *     fetchData(),
 *     5000,
 *     'Data fetch timed out'
 *   );
 * } catch (err) {
 *   if (err instanceof TimeoutError) {
 *     console.log('Timed out after', err.timeoutMs, 'ms');
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message?: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new TimeoutError(message || `Operation timed out after ${timeoutMs}ms`, timeoutMs));
		}, timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutId!);
	}
}
