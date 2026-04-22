import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/lib/runner → repo root
export const REPO_ROOT = path.resolve(here, '..', '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');
export const GEN_DIR = path.join(DATA_DIR, 'generations');
export const EMB_DIR = path.join(DATA_DIR, 'embeddings');
export const PROJECTION_PATH = path.join(DATA_DIR, 'projection.json');

/**
 * Turn an OpenRouter model id like "google/gemini-2.5-flash" into a filesystem-safe
 * directory name: "google__gemini-2-5-flash". Lossy-but-deterministic; used as a key.
 */
export function modelSlug(modelId: string): string {
	return modelId
		.toLowerCase()
		.replace(/[:]/g, '_')
		.replace(/\//g, '__')
		.replace(/\./g, '-')
		.replace(/[^a-z0-9_\-]/g, '-');
}

/**
 * Temperature tag used in file names. 0.7 → "t07", 1.0 → "t10", 1.25 → "t12".
 * One decimal digit is enough resolution for our experiment matrix.
 */
export function tempTag(temperature: number): string {
	const d = Math.round(temperature * 10);
	return `t${String(d).padStart(2, '0')}`;
}

export function parseTempTag(tag: string): number | null {
	const m = tag.match(/^t(\d{2})$/);
	if (!m) return null;
	return parseInt(m[1], 10) / 10;
}

/** Stable file-path triplet for one sample. */
export interface SampleKey {
	modelId: string;
	promptId: string;
	temperature: number;
	sample: number;
}

/**
 * New path format: `{slug}/{pid}--t{TT}-s{S}.json` — one file per sample.
 * Older files written as `{slug}/{pid}.json` are treated as temp=0.7 sample=0 via
 * a one-time migration script.
 */
function fileName(k: SampleKey): string {
	return `${k.promptId}--${tempTag(k.temperature)}-s${k.sample}.json`;
}

export function genPath(k: SampleKey): string {
	return path.join(GEN_DIR, modelSlug(k.modelId), fileName(k));
}

export function embPath(k: SampleKey): string {
	return path.join(EMB_DIR, modelSlug(k.modelId), fileName(k));
}

/** Parse a file name like `p01-identity--t07-s0.json` back into its components. */
export function parseFileName(name: string): { promptId: string; temperature: number; sample: number } | null {
	const m = name.match(/^(.+)--t(\d{2})-s(\d+)\.json$/);
	if (!m) return null;
	return {
		promptId: m[1],
		temperature: parseInt(m[2], 10) / 10,
		sample: parseInt(m[3], 10)
	};
}
