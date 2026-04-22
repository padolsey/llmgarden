/**
 * Manual .env loader so scripts don't need the `dotenv` package.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

export function loadDotEnv(): void {
	try {
		const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
		for (const line of text.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m && !process.env[m[1]]) {
				process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
			}
		}
	} catch {
		// .env missing is fine; env vars may come from the shell.
	}
}
