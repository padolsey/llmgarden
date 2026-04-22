/**
 * One-shot migration: rename existing `{slug}/{pid}.json` files to the new
 * `{slug}/{pid}--t07-s0.json` format (temperature=0.7, sample=0 — the defaults
 * under which the first run was generated).
 *
 * Idempotent. Safe to re-run. Prints what it did.
 */
import { readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { EMB_DIR, GEN_DIR } from '../src/lib/runner/paths.ts';

function migrateDir(root: string): { scanned: number; renamed: number; skipped: number } {
	let scanned = 0, renamed = 0, skipped = 0;
	if (!dirExists(root)) return { scanned, renamed, skipped };

	for (const slug of readdirSync(root)) {
		const slugDir = path.join(root, slug);
		if (!statSync(slugDir).isDirectory()) continue;

		for (const file of readdirSync(slugDir)) {
			if (!file.endsWith('.json')) continue;
			scanned++;

			// Already new-format? skip.
			if (file.match(/--t\d{2}-s\d+\.json$/)) {
				skipped++;
				continue;
			}

			const promptId = file.replace(/\.json$/, '');
			const newName = `${promptId}--t07-s0.json`;
			const from = path.join(slugDir, file);
			const to = path.join(slugDir, newName);
			renameSync(from, to);
			renamed++;
		}
	}

	return { scanned, renamed, skipped };
}

function dirExists(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

console.log('Migrating generations...');
const g = migrateDir(GEN_DIR);
console.log(`  scanned=${g.scanned} renamed=${g.renamed} skipped=${g.skipped}`);

console.log('Migrating embeddings...');
const e = migrateDir(EMB_DIR);
console.log(`  scanned=${e.scanned} renamed=${e.renamed} skipped=${e.skipped}`);

console.log('Done.');
