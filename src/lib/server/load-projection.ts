/**
 * Server-side loader for data/projection.json. Adds family labels and picks a
 * representative sample response per model for tooltip copy.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { GEN_DIR, PROJECTION_PATH } from '../runner/paths.ts';
import { FAMILY_LABELS } from '../data/models.ts';
import { PROMPTS } from '../data/prompts.ts';
import path from 'node:path';

export interface ProjectionModel {
	slug: string;
	family: string;
	label: string;
	base?: string;
	coverage: number;
	missing: string[];
	sample_count: number;
	volatility: number;
	x_umap: number;
	y_umap: number;
	ft_axis: number;
	isolation: number;
	spread_dx: number;
	spread_dy: number;
}

export interface PromptProjection {
	prompt_id: string;
	mean_distance: number;
	coords: { slug: string; x: number; y: number }[];
}

export interface LineagePath {
	name: string;
	description: string;
	slugs: string[];
}

export interface ProjectionModelTemp {
	slug: string;
	family: string;
	temperature: number;
	sample_count: number;
	x_umap: number;
	y_umap: number;
}

export interface ProjectionSample {
	slug: string;
	family: string;
	prompt_id: string;
	temperature: number;
	sample: number;
	x_umap: number;
	y_umap: number;
}

export interface ProjectionEdge {
	from: string;
	to: string;
	similarity: number;
}

export interface ProjectionFile {
	generated_at: number;
	n_models: number;
	n_prompts: number;
	n_samples_total: number;
	embedding_dim_per_prompt: number;
	concat_dim: number;
	models: ProjectionModel[];
	model_temps: ProjectionModelTemp[];
	samples: ProjectionSample[];
	model_knn_edges: ProjectionEdge[];
	pairwise_cosine: number[][];
	per_prompt: PromptProjection[];
	lineage_paths: LineagePath[];
}

export interface LoadedModel extends ProjectionModel {
	family_label: string;
	sample_prompt: string;
	sample_response: string;
}

export interface LoadedData {
	generated_at: number;
	n_prompts: number;
	n_samples_total: number;
	concat_dim: number;
	models: LoadedModel[];
	model_temps: ProjectionModelTemp[];
	samples: ProjectionSample[];
	model_knn_edges: ProjectionEdge[];
	pairwise: number[][];
	family_labels: Record<string, string>;
	prompts: { id: string; category: string; text: string }[];
	per_prompt: PromptProjection[];
	lineage_paths: LineagePath[];
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
		n_prompts: file.n_prompts,
		n_samples_total: file.n_samples_total,
		concat_dim: file.concat_dim,
		models,
		model_temps: file.model_temps,
		samples: file.samples,
		model_knn_edges: file.model_knn_edges,
		pairwise: file.pairwise_cosine,
		family_labels: FAMILY_LABELS,
		prompts: PROMPTS.map((p) => ({ id: p.id, category: p.category, text: p.text })),
		per_prompt: file.per_prompt ?? [],
		lineage_paths: file.lineage_paths ?? []
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

function pickSample(modelId: string): { prompt: string; response: string } | null {
	const dir = path.join(GEN_DIR, slugify(modelId));
	if (!existsSync(dir)) return null;
	const preferredPrompts = ['p04-microstory', 'p05-poem', 'p31-first-person', 'p01-identity', 'p21-joke'];
	const files = new Set(readdirSync(dir));
	for (const pid of preferredPrompts) {
		// Prefer the temp=0.7 s=0 file for consistent "default-voice" tooltips.
		const candidates = [
			`${pid}--t07-s0.json`,
			`${pid}--t02-s0.json`,
			`${pid}--t10-s0.json`
		];
		for (const fname of candidates) {
			if (!files.has(fname)) continue;
			const f = path.join(dir, fname);
			try {
				const data = JSON.parse(readFileSync(f, 'utf8')) as { prompt?: string; response?: string };
				if (data.response) {
					const prompt = PROMPTS.find((p) => p.id === pid)?.text ?? data.prompt ?? '';
					return { prompt, response: data.response };
				}
			} catch {}
		}
	}
	// Fallback: first non-error file in dir
	for (const file of files) {
		if (!file.endsWith('.json')) continue;
		try {
			const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { prompt?: string; response?: string };
			if (data.response) return { prompt: data.prompt ?? '', response: data.response };
		} catch {}
	}
	return null;
}
