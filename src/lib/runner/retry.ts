/**
 * Small retry helper with exponential backoff. Keeps the surface intentionally
 * narrow — we don't need a full policy engine here.
 */

export interface RetryOpts {
	tries?: number;
	baseMs?: number;
	maxMs?: number;
	shouldRetry?: (err: unknown) => boolean;
	onAttemptFail?: (attempt: number, err: unknown) => void;
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
	const tries = opts.tries ?? 3;
	const baseMs = opts.baseMs ?? 800;
	const maxMs = opts.maxMs ?? 8000;
	let lastErr: unknown;

	for (let attempt = 1; attempt <= tries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt === tries || (opts.shouldRetry && !opts.shouldRetry(err))) {
				throw err;
			}
			opts.onAttemptFail?.(attempt, err);
			const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.7 + Math.random() * 0.6);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastErr;
}
