/**
 * Server-side loader for data/projection.json and a sample generation per model
 * (for tooltip display). Runs at SSR time only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { GEN_DIR, PROJECTION_PATH } from '../runner/paths.ts';
import { FAMILY_LABELS } from '../data/models.ts';
import { PROMPTS } from '../data/prompts.ts';
import path from 'node:path';
import { readdirSync } from 'node:fs';

export interface ProjectionRow {
	slug: string;
	family: string;
	label: string;
	coverage: number;
	missing: string[];
	x_umap: number;
	y_umap: number;
}

export interface ProjectionFile {
	generated_at: number;
	n_models: number;
	n_prompts_used: number;
	embedding_dim_per_prompt: number;
	concat_dim: number;
	models: ProjectionRow[];
	pairwise_cosine: number[][];
}

export interface LoadedModel extends ProjectionRow {
	family_label: string;
	sample_prompt: string;
	sample_response: string;
}

export interface LoadedData {
	generated_at: number;
	n_prompts_used: number;
	concat_dim: number;
	models: LoadedModel[];
	pairwise: number[][];
	family_labels: Record<string, string>;
}

export function loadData(): LoadedData | null {
	if (!existsSync(PROJECTION_PATH)) return null;
	const file = JSON.parse(readFileSync(PROJECTION_PATH, 'utf8')) as ProjectionFile;

	const models: LoadedModel[] = file.models.map((m) => {
		const sample = pickSample(m.slug);
		return {
			...m,
			family_label: FAMILY_LABELS[m.family] ?? m.family,
			sample_prompt: sample?.prompt ?? '',
			sample_response: sample?.response ?? ''
		};
	});

	return {
		generated_at: file.generated_at,
		n_prompts_used: file.n_prompts_used,
		concat_dim: file.concat_dim,
		models,
		pairwise: file.pairwise_cosine,
		family_labels: FAMILY_LABELS
	};
}

function slugify(modelId: string): string {
	return modelId
		.toLowerCase()
		.replace(/[:]/g, '_')
		.replace(/\//g, '__')
		.replace(/\./g, '-')
		.replace(/[^a-z0-9_\-]/g, '-');
}

/** Pick a representative sample response: prefer p04-microstory (shows voice), else first available. */
function pickSample(modelId: string): { prompt: string; response: string } | null {
	const dir = path.join(GEN_DIR, slugify(modelId));
	if (!existsSync(dir)) return null;
	const preferredOrder = ['p04-microstory', 'p05-poem', 'p01-identity', 'p21-joke'];
	for (const pid of preferredOrder) {
		const f = path.join(dir, `${pid}.json`);
		if (!existsSync(f)) continue;
		try {
			const data = JSON.parse(readFileSync(f, 'utf8')) as { prompt?: string; response?: string; error?: string };
			if (data.response) {
				const prompt = PROMPTS.find((p) => p.id === pid)?.text ?? data.prompt ?? '';
				return { prompt, response: data.response };
			}
		} catch {}
	}
	// Fallback: any non-error file in the directory.
	for (const file of readdirSync(dir)) {
		if (!file.endsWith('.json')) continue;
		try {
			const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { prompt?: string; response?: string };
			if (data.response) return { prompt: data.prompt ?? '', response: data.response };
		} catch {}
	}
	return null;
}
