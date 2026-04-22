/**
 * One-shot: fetch OpenRouter's model catalog and print (filtered, grouped) IDs so
 * we can sanity-check/curate the list in src/lib/data/models.ts.
 *
 * Usage: pnpm list-models [filter-substring]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../src/lib/runner/paths.ts';

// tsx auto-loads tsconfig but doesn't auto-dotenv; do it manually without a dep.
function loadEnv() {
	try {
		const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
		for (const line of text.split('\n')) {
			const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
		}
	} catch {}
}
loadEnv();

interface OpenRouterModel {
	id: string;
	name?: string;
	context_length?: number;
	pricing?: { prompt?: string; completion?: string };
	top_provider?: { max_completion_tokens?: number | null };
}

async function main() {
	const filter = (process.argv[2] ?? '').toLowerCase();

	const res = await fetch('https://openrouter.ai/api/v1/models', {
		headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}` }
	});
	if (!res.ok) throw new Error(`OpenRouter list-models failed: ${res.status}`);
	const data = (await res.json()) as { data: OpenRouterModel[] };

	const models = data.data
		.filter((m) => !filter || m.id.toLowerCase().includes(filter))
		.sort((a, b) => a.id.localeCompare(b.id));

	const byFamily = new Map<string, OpenRouterModel[]>();
	for (const m of models) {
		const fam = m.id.split('/')[0];
		if (!byFamily.has(fam)) byFamily.set(fam, []);
		byFamily.get(fam)!.push(m);
	}

	console.log(`${models.length} models matched; ${byFamily.size} families\n`);
	for (const [fam, ms] of [...byFamily.entries()].sort()) {
		console.log(`\n=== ${fam} (${ms.length}) ===`);
		for (const m of ms) {
			const promptP = Number(m.pricing?.prompt ?? 0) * 1e6;
			const compP = Number(m.pricing?.completion ?? 0) * 1e6;
			console.log(
				`  ${m.id.padEnd(55)} ctx=${String(m.context_length ?? '?').padStart(7)} $/M: p=${promptP.toFixed(2)} c=${compP.toFixed(2)}`
			);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
