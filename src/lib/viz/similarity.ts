/**
 * Aggregation + similarity utilities over per-(model, prompt) embeddings.
 */

import { existsSync, readFileSync } from 'node:fs';
import { MODELS } from '../data/models.ts';
import { PROMPTS } from '../data/prompts.ts';
import { embPath } from '../runner/paths.ts';

export interface ModelVector {
	slug: string;
	modelId: string;
	family: string;
	label: string;
	/** L2-normalized concat vector over prompts (in fixed PROMPTS order). */
	vector: number[];
	/** Fraction of prompts that had embeddings (0..1). */
	coverage: number;
	/** Prompt IDs that were missing; zero-filled in the vector. */
	missing: string[];
}

/**
 * Build per-model concat vectors in deterministic prompt order. Missing prompts
 * are zero-filled (so the concat vector always has the same dimensionality across
 * models, and missing-data behaves as "no signal" in cosine similarity).
 */
export function loadModelVectors(minCoverage = 0.8): ModelVector[] {
	const out: ModelVector[] = [];

	for (const m of MODELS) {
		const pieces: number[][] = [];
		const missing: string[] = [];
		let filledCount = 0;
		let embDim = 0;

		for (const p of PROMPTS) {
			const f = embPath(m.id, p.id);
			if (!existsSync(f)) {
				missing.push(p.id);
				pieces.push([]);
				continue;
			}
			try {
				const data = JSON.parse(readFileSync(f, 'utf8')) as { vector: number[]; dim: number };
				if (!data.vector || data.vector.length === 0) {
					missing.push(p.id);
					pieces.push([]);
					continue;
				}
				embDim = data.dim ?? data.vector.length;
				pieces.push(data.vector);
				filledCount++;
			} catch {
				missing.push(p.id);
				pieces.push([]);
			}
		}

		if (embDim === 0) continue;

		const coverage = filledCount / PROMPTS.length;
		if (coverage < minCoverage) {
			console.warn(`  skip ${m.id}: coverage ${(coverage * 100).toFixed(0)}% < ${minCoverage * 100}%`);
			continue;
		}

		// Concatenate, zero-filling missing prompts with embDim zeros.
		const total = embDim * PROMPTS.length;
		const flat = new Array<number>(total).fill(0);
		for (let i = 0; i < pieces.length; i++) {
			const piece = pieces[i];
			if (piece.length === 0) continue;
			for (let j = 0; j < embDim; j++) flat[i * embDim + j] = piece[j];
		}

		out.push({
			slug: m.id,
			modelId: m.id,
			family: m.family,
			label: m.label,
			vector: l2normalize(flat),
			coverage,
			missing
		});
	}

	return out;
}

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
