/**
 * Main harness entrypoint. Resumable — skip-if-exists semantics.
 *
 * Flags:
 *   --concurrency=N         global parallel workers (default 8)
 *   --per-model=N           max in-flight per model (default 3)
 *   --retry-failed          re-run only generations that errored previously
 *   --only-model=id         limit to one model
 *   --only-prompt=id        limit to one prompt
 *   --temps=0.3,0.7,1.0     comma-separated temperatures to sweep (default: 0.7)
 *   --samples=N             samples per (model, prompt, temp) (default: 1)
 *   --gen-timeout-ms=N      per-call generation timeout (default 90000)
 *   --embed-timeout-ms=N    per-call embedding timeout (default 30000)
 */
import { loadDotEnv } from '../src/lib/runner/env.ts';
import { run } from '../src/lib/runner/orchestrate.ts';

loadDotEnv();

function arg(name: string, fallback?: string): string | undefined {
	const p = process.argv.find((a) => a.startsWith(`--${name}=`));
	if (p) return p.slice(name.length + 3);
	if (process.argv.includes(`--${name}`)) return 'true';
	return fallback;
}

const concurrency = Number(arg('concurrency', '8'));
const perModel = Number(arg('per-model', '3'));
const retryFailed = arg('retry-failed') === 'true';
const onlyModel = arg('only-model');
const onlyPrompt = arg('only-prompt');
const tempsStr = arg('temps', '0.7')!;
const temps = tempsStr.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const samplesPerTemp = Number(arg('samples', '1'));
const genTimeoutMs = Number(arg('gen-timeout-ms', '90000'));
const embedTimeoutMs = Number(arg('embed-timeout-ms', '30000'));

if (temps.length === 0) {
	console.error(`Invalid --temps: "${tempsStr}"`);
	process.exit(1);
}
if (samplesPerTemp < 1) {
	console.error(`Invalid --samples: ${samplesPerTemp}`);
	process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY) {
	console.error('OPENROUTER_API_KEY not set (looked in .env and process.env).');
	process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
	console.error('OPENAI_API_KEY not set.');
	process.exit(1);
}

run({
	concurrency,
	perModelConcurrency: perModel,
	retryFailed,
	onlyModel,
	onlyPrompt,
	temps,
	samplesPerTemp,
	genTimeoutMs,
	embedTimeoutMs
}).catch((err) => {
	console.error('Harness failed:', err);
	process.exit(1);
});
