import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generate, isRetryable as isGenRetryable, OpenRouterError } from '../providers/openrouter.ts';
import { embed } from '../providers/openai-embeddings.ts';
import { MODELS, type ModelSpec } from '../data/models.ts';
import { PROMPTS, type PromptSpec } from '../data/prompts.ts';
import { mapWithConcurrency, withTimeout } from './concurrency.ts';
import { PerKeySemaphore } from './per-key-semaphore.ts';
import { retry } from './retry.ts';
import { embPath, genPath, type SampleKey } from './paths.ts';

export interface RunOptions {
	concurrency: number;
	perModelConcurrency: number;
	retryFailed: boolean;
	onlyModel?: string;
	onlyPrompt?: string;
	/** Temperatures to sweep. */
	temps: number[];
	/** Samples to collect at each temperature. */
	samplesPerTemp: number;
	genTimeoutMs: number;
	embedTimeoutMs: number;
}

export interface RunSummary {
	total: number;
	planned: number;
	skipped: number;
	genSuccess: number;
	genError: number;
	embedSuccess: number;
	embedError: number;
}

interface GenFile {
	model: string;
	prompt_id: string;
	prompt: string;
	temperature: number;
	sample: number;
	response?: string;
	usage?: unknown;
	raw_model?: string;
	error?: string;
	error_status?: number | null;
	ts: number;
}

interface EmbFile {
	model: string;
	prompt_id: string;
	temperature: number;
	sample: number;
	embedding_model: string;
	dim: number;
	vector: number[];
	ts: number;
}

function ensureDir(filePath: string) {
	mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJSON(filePath: string, data: unknown) {
	ensureDir(filePath);
	writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readJSON<T>(filePath: string): T | null {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8')) as T;
	} catch {
		return null;
	}
}

function isGenDone(p: string, retryFailed: boolean): boolean {
	if (!existsSync(p)) return false;
	if (!retryFailed) return true;
	const file = readJSON<GenFile>(p);
	return !!file && !file.error;
}

interface WorkItem {
	model: ModelSpec;
	prompt: PromptSpec;
	key: SampleKey;
}

function buildWorkList(opts: RunOptions): { total: number; planned: WorkItem[] } {
	const models = opts.onlyModel ? MODELS.filter((m) => m.id === opts.onlyModel) : MODELS;
	const prompts = opts.onlyPrompt ? PROMPTS.filter((p) => p.id === opts.onlyPrompt) : PROMPTS;

	const all: WorkItem[] = [];
	for (const m of models) {
		for (const p of prompts) {
			for (const t of opts.temps) {
				for (let s = 0; s < opts.samplesPerTemp; s++) {
					const key: SampleKey = {
						modelId: m.id,
						promptId: p.id,
						temperature: t,
						sample: s
					};
					all.push({ model: m, prompt: p, key });
				}
			}
		}
	}

	const planned = all.filter(({ key }) => {
		const g = genPath(key);
		const e = embPath(key);
		const genOk = isGenDone(g, opts.retryFailed);
		const embOk = existsSync(e);
		return !(genOk && embOk);
	});

	return { total: all.length, planned };
}

export async function run(opts: RunOptions): Promise<RunSummary> {
	const summary: RunSummary = {
		total: 0,
		planned: 0,
		skipped: 0,
		genSuccess: 0,
		genError: 0,
		embedSuccess: 0,
		embedError: 0
	};

	const { total, planned } = buildWorkList(opts);
	summary.total = total;
	summary.planned = planned.length;
	summary.skipped = total - planned.length;

	if (planned.length === 0) {
		console.log(`Nothing to do — all ${total} samples already have gen + embedding.`);
		return summary;
	}

	console.log(
		`Planned ${planned.length}/${total} samples (${summary.skipped} skipped). ` +
			`global concurrency=${opts.concurrency}, per-model=${opts.perModelConcurrency}, ` +
			`temps=[${opts.temps.join(',')}], samples-per-temp=${opts.samplesPerTemp}.`
	);

	const perModel = new PerKeySemaphore(opts.perModelConcurrency);
	let completed = 0;
	const reportEvery = Math.max(20, Math.floor(planned.length / 40));

	await mapWithConcurrency(
		planned,
		async ({ model, prompt, key }) => {
			const release = await perModel.acquire(model.id);
			try {
				await processOne(model, prompt, key, opts, summary);
			} finally {
				release();
				completed++;
				if (completed % reportEvery === 0 || completed === planned.length) {
					const pct = ((completed / planned.length) * 100).toFixed(1);
					console.log(
						`  [${completed}/${planned.length} ${pct}%] gen ok=${summary.genSuccess} err=${summary.genError}  emb ok=${summary.embedSuccess} err=${summary.embedError}`
					);
				}
			}
		},
		opts.concurrency
	);

	console.log('\nRun complete.');
	console.log(summary);
	return summary;
}

async function processOne(
	model: ModelSpec,
	prompt: PromptSpec,
	key: SampleKey,
	opts: RunOptions,
	summary: RunSummary
) {
	const gPath = genPath(key);
	const ePath = embPath(key);

	// ---- Generation
	let genFile = isGenDone(gPath, opts.retryFailed) ? readJSON<GenFile>(gPath) : null;

	if (!genFile || genFile.error || !genFile.response) {
		try {
			const result = await retry(
				() =>
					withTimeout(
						generate({ model: model.id, prompt: prompt.text, temperature: key.temperature, maxTokens: 600 }),
						opts.genTimeoutMs,
						`generate(${model.id}) timed out`
					),
				{
					tries: 3,
					shouldRetry: isGenRetryable,
					onAttemptFail: (attempt, err) =>
						console.warn(`    retry ${attempt} ${model.id} ${prompt.id} t=${key.temperature} s=${key.sample}: ${short(err)}`)
				}
			);
			genFile = {
				model: model.id,
				prompt_id: prompt.id,
				prompt: prompt.text,
				temperature: key.temperature,
				sample: key.sample,
				response: result.text,
				usage: result.usage,
				raw_model: result.raw_model,
				ts: Date.now()
			};
			writeJSON(gPath, genFile);
			summary.genSuccess++;
		} catch (err) {
			const status = err instanceof OpenRouterError ? err.status : null;
			genFile = {
				model: model.id,
				prompt_id: prompt.id,
				prompt: prompt.text,
				temperature: key.temperature,
				sample: key.sample,
				error: short(err),
				error_status: status,
				ts: Date.now()
			};
			writeJSON(gPath, genFile);
			summary.genError++;
			console.warn(`  ✗ gen ${model.id} ${prompt.id} t=${key.temperature} s=${key.sample}: ${genFile.error}`);
			return;
		}
	}

	// ---- Embedding (only if we have a response, and no valid embedding yet)
	if (!genFile.response) return;
	if (existsSync(ePath)) return;

	try {
		const vec = await retry(
			() =>
				withTimeout(
					embed({ input: genFile!.response! }),
					opts.embedTimeoutMs,
					`embed(${model.id} ${prompt.id}) timed out`
				),
			{ tries: 3, onAttemptFail: (a, e) => console.warn(`    retry embed ${a} ${short(e)}`) }
		);
		const embFile: EmbFile = {
			model: model.id,
			prompt_id: prompt.id,
			temperature: key.temperature,
			sample: key.sample,
			embedding_model: 'text-embedding-3-small',
			dim: vec.length,
			vector: vec,
			ts: Date.now()
		};
		writeJSON(ePath, embFile);
		summary.embedSuccess++;
	} catch (err) {
		summary.embedError++;
		console.warn(`  ✗ embed ${model.id} ${prompt.id} t=${key.temperature} s=${key.sample}: ${short(err)}`);
	}
}

function short(err: unknown): string {
	if (err instanceof Error) return err.message.slice(0, 200);
	return String(err).slice(0, 200);
}
