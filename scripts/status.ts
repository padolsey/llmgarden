/**
 * Print a coverage grid: rows=models, cols=prompts, cells={. = missing, ✓ = done, ! = errored, e = missing embedding}.
 */
import { existsSync, readFileSync } from 'node:fs';
import { MODELS } from '../src/lib/data/models.ts';
import { PROMPTS } from '../src/lib/data/prompts.ts';
import { embPath, genPath } from '../src/lib/runner/paths.ts';

function cell(modelId: string, promptId: string): string {
	const g = genPath(modelId, promptId);
	const e = embPath(modelId, promptId);
	if (!existsSync(g)) return '.';
	try {
		const parsed = JSON.parse(readFileSync(g, 'utf8'));
		if (parsed.error) return '!';
	} catch {
		return '?';
	}
	if (!existsSync(e)) return 'e';
	return '✓';
}

const header = '                                                ' + PROMPTS.map((p) => p.id.slice(1, 3)).join(' ');
console.log(header);

let totalDone = 0;
let totalErr = 0;
let totalMissing = 0;
let totalEmbMissing = 0;

for (const m of MODELS) {
	const cells = PROMPTS.map((p) => cell(m.id, p.id));
	const done = cells.filter((c) => c === '✓').length;
	const err = cells.filter((c) => c === '!').length;
	const missing = cells.filter((c) => c === '.').length;
	const embMiss = cells.filter((c) => c === 'e').length;
	totalDone += done;
	totalErr += err;
	totalMissing += missing;
	totalEmbMissing += embMiss;
	const label = `${m.id}  ${done}/${PROMPTS.length}`.padEnd(48);
	console.log(`${label}${cells.join('  ')}`);
}

console.log('');
console.log(`legend:  ✓=done  !=gen-error  e=gen-ok-embed-missing  .=missing`);
console.log(
	`total:  done=${totalDone}  err=${totalErr}  embed-missing=${totalEmbMissing}  missing=${totalMissing}  ` +
		`(of ${MODELS.length * PROMPTS.length})`
);
