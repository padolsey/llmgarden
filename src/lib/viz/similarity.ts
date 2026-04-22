/**
 * Aggregation utilities over the multi-sample embedding corpus.
 *
 * Two granularities:
 *   1. ModelFingerprint — one per model. Per-prompt samples are averaged then
 *      L2-normalized; fingerprint = concat of per-prompt mean vectors. Used
 *      for the main "who clusters with whom" UMAP.
 *   2. SamplePoint — one per (model, prompt, temp, sample). Used for the
 *      "cloud" view where every individual response is its own point.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MODELS } from '../data/models.ts';
import { PROMPTS } from '../data/prompts.ts';
import { EMB_DIR, modelSlug, parseFileName } from '../runner/paths.ts';

export interface SamplePoint {
	modelId: string;
	family: string;
	label: string;
	promptId: string;
	temperature: number;
	sample: number;
	/** L2-normalized (already from OpenAI). */
	vector: number[];
}

export interface ModelFingerprint {
	modelId: string;
	family: string;
	label: string;
	/** L2-normalized concat of per-prompt mean vectors. */
	vector: number[];
	/** Fraction of prompts that had at least one embedding. */
	coverage: number;
	/** Prompt IDs that had no samples. */
	missing: string[];
	/** Total number of underlying samples. */
	sampleCount: number;
	/**
	 * Intra-model volatility: mean cosine *distance* (1 - cos) between same-cell
	 * samples, averaged across all (prompt, temp) cells that have >= 2 samples.
	 * Higher = more stochastic voice. 0 = perfectly deterministic.
	 */
	volatility: number;
}

/** Load every embedding file on disk for `modelId`, bucketed by prompt. */
export function loadSamples(modelId: string): SamplePoint[] {
	const slug = modelSlug(modelId);
	const dir = path.join(EMB_DIR, slug);
	if (!existsSync(dir)) return [];

	const spec = MODELS.find((m) => m.id === modelId);
	const family = spec?.family ?? 'unknown';
	const label = spec?.label ?? modelId;

	const out: SamplePoint[] = [];
	for (const file of readdirSync(dir)) {
		const parsed = parseFileName(file);
		if (!parsed) continue;
		try {
			const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
				vector: number[]; dim: number;
			};
			if (!data.vector || data.vector.length === 0) continue;
			out.push({
				modelId,
				family,
				label,
				promptId: parsed.promptId,
				temperature: parsed.temperature,
				sample: parsed.sample,
				vector: data.vector
			});
		} catch {
			// skip malformed files
		}
	}
	return out;
}

/** All samples across all models. */
export function loadAllSamples(): SamplePoint[] {
	const out: SamplePoint[] = [];
	for (const m of MODELS) out.push(...loadSamples(m.id));
	return out;
}

/**
 * Build per-model fingerprints from the on-disk samples. Per-prompt samples are
 * averaged (then L2-normalized) before concat. This makes fingerprints stable
 * under "sample count per cell" changes — adding more samples at the same temp
 * just tightens the per-prompt mean.
 */
export function loadModelFingerprints(minCoverage = 0.8): ModelFingerprint[] {
	const out: ModelFingerprint[] = [];

	for (const m of MODELS) {
		const samples = loadSamples(m.id);
		if (samples.length === 0) continue;

		// Group samples by prompt
		const byPrompt = new Map<string, SamplePoint[]>();
		for (const s of samples) {
			if (!byPrompt.has(s.promptId)) byPrompt.set(s.promptId, []);
			byPrompt.get(s.promptId)!.push(s);
		}

		// Determine embedding dim from any sample
		const embDim = samples[0].vector.length;

		const missing: string[] = [];
		let filledCount = 0;

		// Build concat vector in fixed PROMPTS order
		const total = embDim * PROMPTS.length;
		const flat = new Array<number>(total).fill(0);

		for (let pi = 0; pi < PROMPTS.length; pi++) {
			const p = PROMPTS[pi];
			const ss = byPrompt.get(p.id);
			if (!ss || ss.length === 0) {
				missing.push(p.id);
				continue;
			}
			// Mean of sample vectors for this prompt (across temps+samples), then
			// L2-normalize just that piece so each prompt contributes equally
			// regardless of how many samples we collected for it.
			const mean = meanVector(ss.map((x) => x.vector));
			const n = l2normalize(mean);
			for (let j = 0; j < embDim; j++) flat[pi * embDim + j] = n[j];
			filledCount++;
		}

		const coverage = filledCount / PROMPTS.length;
		if (coverage < minCoverage) {
			console.warn(`  skip ${m.id}: coverage ${(coverage * 100).toFixed(0)}% < ${minCoverage * 100}%`);
			continue;
		}

		// Intra-cell volatility: for each (prompt, temp) cell with >=2 samples, the
		// mean cosine distance between samples.
		const cellKeys = new Map<string, SamplePoint[]>();
		for (const s of samples) {
			const k = `${s.promptId}::${s.temperature}`;
			if (!cellKeys.has(k)) cellKeys.set(k, []);
			cellKeys.get(k)!.push(s);
		}
		let volSum = 0, volN = 0;
		for (const ss of cellKeys.values()) {
			if (ss.length < 2) continue;
			for (let i = 0; i < ss.length; i++) {
				for (let j = i + 1; j < ss.length; j++) {
					volSum += 1 - cosine(ss[i].vector, ss[j].vector);
					volN++;
				}
			}
		}
		const volatility = volN > 0 ? volSum / volN : 0;

		out.push({
			modelId: m.id,
			family: m.family,
			label: m.label,
			vector: l2normalize(flat),
			coverage,
			missing,
			sampleCount: samples.length,
			volatility
		});
	}

	return out;
}

// ============================================================================
// Vector math
// ============================================================================

export function l2normalize(v: number[]): number[] {
	let s = 0;
	for (let i = 0; i < v.length; i++) s += v[i] * v[i];
	const n = Math.sqrt(s);
	if (n === 0) return v.slice();
	const out = new Array(v.length);
	for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
	return out;
}

export function cosine(a: number[], b: number[]): number {
	let dot = 0;
	for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
	return dot;
}

export function pairwiseCosine(vectors: number[][]): number[][] {
	const n = vectors.length;
	const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		out[i][i] = 1;
		for (let j = i + 1; j < n; j++) {
			const c = cosine(vectors[i], vectors[j]);
			out[i][j] = c;
			out[j][i] = c;
		}
	}
	return out;
}

export function meanVector(vectors: number[][]): number[] {
	if (vectors.length === 0) return [];
	const d = vectors[0].length;
	const out = new Array(d).fill(0);
	for (const v of vectors) for (let i = 0; i < d; i++) out[i] += v[i];
	for (let i = 0; i < d; i++) out[i] /= vectors.length;
	return out;
}

/** Subtract two vectors, returning a + (-b). */
export function subtract(a: number[], b: number[]): number[] {
	const d = a.length;
	const out = new Array(d);
	for (let i = 0; i < d; i++) out[i] = a[i] - b[i];
	return out;
}

/** Per-prompt per-model mean vector, for per-prompt projections. */
export function perPromptModelMeans(samples: SamplePoint[]): Map<string, Map<string, number[]>> {
	const out = new Map<string, Map<string, number[]>>();
	const byCell = new Map<string, Map<string, number[][]>>();
	for (const s of samples) {
		if (!byCell.has(s.promptId)) byCell.set(s.promptId, new Map());
		const pm = byCell.get(s.promptId)!;
		if (!pm.has(s.modelId)) pm.set(s.modelId, []);
		pm.get(s.modelId)!.push(s.vector);
	}
	for (const [pid, pm] of byCell.entries()) {
		const modelMeans = new Map<string, number[]>();
		for (const [mid, vs] of pm.entries()) {
			modelMeans.set(mid, l2normalize(meanVector(vs)));
		}
		out.set(pid, modelMeans);
	}
	return out;
}
