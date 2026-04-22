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

export function genPath(modelId: string, promptId: string): string {
	return path.join(GEN_DIR, modelSlug(modelId), `${promptId}.json`);
}

export function embPath(modelId: string, promptId: string): string {
	return path.join(EMB_DIR, modelSlug(modelId), `${promptId}.json`);
}
