/**
 * Coverage report: total samples done per model, per-temperature, per-prompt.
 *
 * Emits a compact table like:
 *   model                                          t=0.2  t=0.7  t=1.0   total
 *   anthropic/claude-opus-4.7                      30/30  30/30  90/90   150/150
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { MODELS } from '../src/lib/data/models.ts';
import { PROMPTS } from '../src/lib/data/prompts.ts';
import { GEN_DIR, EMB_DIR, modelSlug, parseFileName, tempTag } from '../src/lib/runner/paths.ts';

interface SamplePlan {
	temps: number[];
	samplesPerTemp: number;
}

function arg(name: string, fallback?: string): string | undefined {
	const p = process.argv.find((a) => a.startsWith(`--${name}=`));
	return p ? p.slice(name.length + 3) : fallback;
}

const tempsStr = arg('temps', '0.7')!;
const plan: SamplePlan = {
	temps: tempsStr.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)),
	samplesPerTemp: Number(arg('samples', '1'))
};

interface Cell {
	done: number;
	err: number;
	missing: number;
	embMissing: number;
}

function scan(modelId: string, temp: number): Cell {
	const slug = modelSlug(modelId);
	const dir = path.join(GEN_DIR, slug);
	const cell: Cell = { done: 0, err: 0, missing: 0, embMissing: 0 };
	const ttag = tempTag(temp);

	for (const p of PROMPTS) {
		for (let s = 0; s < plan.samplesPerTemp; s++) {
			const fname = `${p.id}--${ttag}-s${s}.json`;
			const gPath = path.join(dir, fname);
			const ePath = path.join(EMB_DIR, slug, fname);

			if (!existsSync(gPath)) { cell.missing++; continue; }
			try {
				const parsed = JSON.parse(readFileSync(gPath, 'utf8')) as { error?: string };
				if (parsed.error) { cell.err++; continue; }
			} catch { cell.missing++; continue; }
			if (!existsSync(ePath)) { cell.embMissing++; continue; }
			cell.done++;
		}
	}

	return cell;
}

function fmt(cell: Cell, expected: number): string {
	const status = cell.done === expected ? '✓' : (cell.err > 0 ? '!' : (cell.embMissing > 0 ? 'e' : '·'));
	return `${cell.done}/${expected}${cell.err ? `!${cell.err}` : ''}${cell.embMissing ? `e${cell.embMissing}` : ''}`.padEnd(8);
}

const perTempExpected = PROMPTS.length * plan.samplesPerTemp;
const totalExpected = plan.temps.length * perTempExpected;

const header = 'model'.padEnd(48) + plan.temps.map((t) => `t=${t.toFixed(1)}`.padEnd(8)).join('') + 'total';
console.log(header);
console.log('-'.repeat(header.length));

let grandDone = 0, grandErr = 0;
for (const m of MODELS) {
	const cells = plan.temps.map((t) => scan(m.id, t));
	const done = cells.reduce((a, c) => a + c.done, 0);
	const err = cells.reduce((a, c) => a + c.err, 0);
	grandDone += done; grandErr += err;
	const row = m.id.padEnd(48) + cells.map((c) => fmt(c, perTempExpected)).join('') + `${done}/${totalExpected}`;
	console.log(row);
}

console.log('');
console.log(`grand total: done=${grandDone}  err=${grandErr}  of ${MODELS.length * totalExpected}  (${((grandDone / (MODELS.length * totalExpected)) * 100).toFixed(1)}%)`);
console.log(`plan: temps=[${plan.temps.join(',')}]  samples-per-temp=${plan.samplesPerTemp}`);
