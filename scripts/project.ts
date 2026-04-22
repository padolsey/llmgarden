/**
 * Build data/projection.json from the per-model embeddings.
 *
 * Reads embeddings → concatenates per model → L2-normalizes → runs UMAP →
 * also computes a pairwise cosine-similarity matrix for future heatmap view.
 */
import { writeFileSync } from 'node:fs';
import { loadModelVectors, pairwiseCosine } from '../src/lib/viz/similarity.ts';
import { umap2d } from '../src/lib/viz/project.ts';
import { PROJECTION_PATH } from '../src/lib/runner/paths.ts';
import { PROMPTS } from '../src/lib/data/prompts.ts';
import { EMBEDDING_DIMENSIONS } from '../src/lib/providers/openai-embeddings.ts';

interface ProjectionRow {
	slug: string;
	family: string;
	label: string;
	coverage: number;
	missing: string[];
	x_umap: number;
	y_umap: number;
}

interface ProjectionFile {
	generated_at: number;
	n_models: number;
	n_prompts_used: number;
	embedding_dim_per_prompt: number;
	concat_dim: number;
	models: ProjectionRow[];
	pairwise_cosine: number[][]; // indexed by models order above
}

async function main() {
	console.log('Loading embeddings...');
	const vectors = loadModelVectors(0.8);
	if (vectors.length < 3) {
		console.error(`Only ${vectors.length} models have >=80% coverage — need >=3 for UMAP.`);
		process.exit(1);
	}

	console.log(`${vectors.length} models pass coverage filter.`);

	console.log('Computing pairwise cosine similarity...');
	const sim = pairwiseCosine(vectors.map((v) => v.vector));

	console.log('Running UMAP (2D)...');
	const points = umap2d(vectors.map((v) => v.vector));

	const concatDim = vectors[0].vector.length;

	const rows: ProjectionRow[] = vectors.map((v, i) => ({
		slug: v.slug,
		family: v.family,
		label: v.label,
		coverage: v.coverage,
		missing: v.missing,
		x_umap: points[i].x,
		y_umap: points[i].y
	}));

	const out: ProjectionFile = {
		generated_at: Date.now(),
		n_models: vectors.length,
		n_prompts_used: PROMPTS.length,
		embedding_dim_per_prompt: EMBEDDING_DIMENSIONS,
		concat_dim: concatDim,
		models: rows,
		pairwise_cosine: sim
	};

	writeFileSync(PROJECTION_PATH, JSON.stringify(out, null, 2));
	console.log(`Wrote ${PROJECTION_PATH} — ${vectors.length} models.`);
	console.log('UMAP extent:',
		`x=[${Math.min(...points.map((p) => p.x)).toFixed(2)}, ${Math.max(...points.map((p) => p.x)).toFixed(2)}]`,
		`y=[${Math.min(...points.map((p) => p.y)).toFixed(2)}, ${Math.max(...points.map((p) => p.y)).toFixed(2)}]`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
