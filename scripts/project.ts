/**
 * Build data/projection.json from the multi-sample embedding corpus.
 *
 * Emits:
 *   1. Model-level fingerprints (MDS) — one point per model
 *   2. Model × temperature centroids — for temperature trajectories
 *   3. Per-sample points — for the WebGL "all-samples cloud" view
 *   4. Per-prompt projections — one MDS per prompt, showing how models shift
 *      across prompt types
 *   5. Model-level kNN edges
 *   6. Pairwise cosine similarity
 *   7. Community-fine-tune axis — a 1D "how much does this model sound like a
 *      community RP fine-tune?" score per model
 *   8. Isolation score — cos-distance from the global corpus centroid
 *   9. Per-model spread direction at temp=1.0 (in fingerprint-MDS frame)
 *  10. Lineage paths — ordered sequences (Claude 3.5→4.7, Qwen 2.5→3, etc.)
 *      for drawing generational/ancestry arrows on the main scatter
 */
import { writeFileSync } from 'node:fs';
import {
	loadAllSamples,
	loadModelFingerprints,
	l2normalize,
	meanVector,
	subtract,
	pairwiseCosine,
	perPromptModelMeans,
	type SamplePoint
} from '../src/lib/viz/similarity.ts';
import { procrustesAlign, umap2d, type Point2D } from '../src/lib/viz/project.ts';
import { mds2d, normalize2D } from '../src/lib/viz/mds.ts';
import { knnEdges } from '../src/lib/viz/knn.ts';
import { PROJECTION_PATH } from '../src/lib/runner/paths.ts';
import { MODELS } from '../src/lib/data/models.ts';
import { PROMPTS } from '../src/lib/data/prompts.ts';
import { EMBEDDING_DIMENSIONS } from '../src/lib/providers/openai-embeddings.ts';

interface ModelRow {
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
	/** Community fine-tune axis position. Higher = sounds more like a community RP FT. */
	ft_axis: number;
	/** Cos-distance from the global corpus centroid (normalized mean of all model means). */
	isolation: number;
	/** Top-PC direction at temp=1.0, expressed in the fingerprint-MDS 2D frame. */
	spread_dx: number;
	spread_dy: number;
}

interface ModelTempRow {
	slug: string;
	family: string;
	temperature: number;
	sample_count: number;
	x_umap: number;
	y_umap: number;
}

interface SampleRow {
	slug: string;
	family: string;
	prompt_id: string;
	temperature: number;
	sample: number;
	x_umap: number;
	y_umap: number;
}

interface ModelEdge {
	from: string;
	to: string;
	similarity: number;
}

interface PromptProjection {
	prompt_id: string;
	/** Mean pairwise cosine distance across all model-pair responses — higher = more discriminating. */
	mean_distance: number;
	/** Per-model 2D coords in this prompt's MDS frame (indexed by models[] order above). */
	coords: { slug: string; x: number; y: number }[];
}

interface LineagePath {
	name: string;
	description: string;
	/** Ordered list of model slugs along the lineage. */
	slugs: string[];
}

interface ProjectionFile {
	generated_at: number;
	n_models: number;
	n_prompts: number;
	n_samples_total: number;
	embedding_dim_per_prompt: number;
	concat_dim: number;
	models: ModelRow[];
	model_temps: ModelTempRow[];
	samples: SampleRow[];
	model_knn_edges: ModelEdge[];
	pairwise_cosine: number[][];
	per_prompt: PromptProjection[];
	lineage_paths: LineagePath[];
}

/**
 * Hard-coded lineage paths. Each traces an ordered version/size progression worth
 * drawing as an arrow on the main scatter.
 */
const LINEAGE_PATHS: LineagePath[] = [
	{
		name: 'Claude generations',
		description: '3.5 → 3.7 → 4.5 / 4.6 / 4.7',
		slugs: [
			'anthropic/claude-3.5-haiku',
			'anthropic/claude-3.7-sonnet',
			'anthropic/claude-haiku-4.5',
			'anthropic/claude-sonnet-4.6',
			'anthropic/claude-opus-4.7'
		]
	},
	{
		name: 'Gemini generations',
		description: '2.0 → 2.5-flash → 2.5-pro',
		slugs: [
			'google/gemini-2.0-flash-001',
			'google/gemini-2.5-flash',
			'google/gemini-2.5-pro'
		]
	},
	{
		name: 'Qwen generations',
		description: 'Qwen-2.5 → Qwen-3 series',
		slugs: [
			'qwen/qwen-2.5-72b-instruct',
			'qwen/qwen3-30b-a3b-instruct-2507',
			'qwen/qwen3-235b-a22b-2507',
			'qwen/qwen3-max'
		]
	},
	{
		name: 'GPT generations',
		description: 'GPT-4o-mini → 4.1-mini → 4.1 → 5-mini → 5',
		slugs: [
			'openai/gpt-4o-mini',
			'openai/gpt-4.1-mini',
			'openai/gpt-4.1',
			'openai/gpt-5-mini',
			'openai/gpt-5'
		]
	},
	{
		name: 'Llama → Hermes',
		description: 'Meta Llama 3.3/4 → Nous Hermes fine-tunes',
		slugs: [
			'meta-llama/llama-3.3-70b-instruct',
			'nousresearch/hermes-3-llama-3.1-70b',
			'nousresearch/hermes-4-70b',
			'nousresearch/hermes-4-405b'
		]
	},
	{
		name: 'Llama → Euryale',
		description: 'Meta Llama → Sao10k Euryale RP fine-tunes',
		slugs: [
			'meta-llama/llama-3.3-70b-instruct',
			'sao10k/l3.1-euryale-70b',
			'sao10k/l3.3-euryale-70b'
		]
	},
	{
		name: 'Mistral → RP fine-tunes',
		description: 'Mistral Nemo / Small → TheDrummer',
		slugs: [
			'mistralai/mistral-nemo',
			'thedrummer/rocinante-12b',
			'mistralai/mistral-small-3.2-24b-instruct',
			'thedrummer/cydonia-24b-v4.1'
		]
	}
];

/** Map `base` field → family key used in MODELS. */
const BASE_TO_FAMILY: Record<string, string> = {
	'meta-llama': 'meta',
	qwen: 'qwen',
	mistral: 'mistral'
};

async function main() {
	console.log('Loading embeddings...');
	const fingerprints = loadModelFingerprints(0.8);
	if (fingerprints.length < 3) {
		console.error(`Only ${fingerprints.length} models have >=80% coverage — need >=3 for UMAP.`);
		process.exit(1);
	}
	console.log(`${fingerprints.length} models pass coverage filter.`);

	const concatDim = fingerprints[0].vector.length;

	// ─── Pairwise cosine ────────────────────────────────────────────────────
	console.log('Computing pairwise cosine...');
	const sim = pairwiseCosine(fingerprints.map((f) => f.vector));

	// ─── Model MDS (cosine-distance-preserving 2D) ─────────────────────────
	console.log('Running MDS on model fingerprints...');
	const cosDist = sim.map((row) => row.map((s) => Math.max(0, 1 - s)));
	const modelPoints = normalize2D(mds2d(cosDist));

	// ─── kNN edges ─────────────────────────────────────────────────────────
	console.log('kNN at model-centroid level...');
	const idxEdges = knnEdges(fingerprints.map((f) => f.vector), 5);
	const modelKnn: ModelEdge[] = idxEdges.map((e) => ({
		from: fingerprints[e.from].slug,
		to: fingerprints[e.to].slug,
		similarity: e.similarity
	}));

	// ─── Samples + model×temp centroids ─────────────────────────────────────
	console.log('Loading samples...');
	const allSamples = loadAllSamples();
	console.log(`  ${allSamples.length} samples on disk.`);

	const byModelTemp = new Map<string, SamplePoint[]>();
	for (const s of allSamples) {
		const k = `${s.modelId}::${s.temperature}`;
		if (!byModelTemp.has(k)) byModelTemp.set(k, []);
		byModelTemp.get(k)!.push(s);
	}
	interface TempCentroid {
		modelId: string;
		family: string;
		temperature: number;
		vec: number[];
		count: number;
	}
	const modelTempCentroids: TempCentroid[] = [];
	for (const [key, ss] of byModelTemp.entries()) {
		if (ss.length < 3) continue;
		const [modelId, tempStr] = key.split('::');
		const mv = l2normalize(meanVector(ss.map((x) => x.vector)));
		modelTempCentroids.push({
			modelId,
			family: ss[0].family,
			temperature: Number(tempStr),
			vec: mv,
			count: ss.length
		});
	}

	// ─── Per-sample UMAP + Procrustes alignment to MDS frame ──────────────
	console.log(`Running UMAP on ${allSamples.length} samples...`);
	const samplePoints = umap2d(
		allSamples.map((s) => s.vector),
		{ nNeighbors: Math.min(30, Math.max(5, Math.floor(Math.sqrt(allSamples.length)))), minDist: 0.1 }
	);

	console.log('Aligning sample cloud to fingerprint MDS frame...');
	const sampleCentroidsByModel = new Map<string, Point2D[]>();
	for (let i = 0; i < allSamples.length; i++) {
		const m = allSamples[i].modelId;
		if (!sampleCentroidsByModel.has(m)) sampleCentroidsByModel.set(m, []);
		sampleCentroidsByModel.get(m)!.push(samplePoints[i]);
	}

	const anchorsA: Point2D[] = [];
	const anchorsB: Point2D[] = [];
	for (let i = 0; i < fingerprints.length; i++) {
		const m = fingerprints[i].modelId;
		const pts = sampleCentroidsByModel.get(m);
		if (!pts || pts.length === 0) continue;
		const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
		const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
		anchorsA.push(modelPoints[i]);
		anchorsB.push({ x: mx, y: my });
	}

	let samplePointsAligned = samplePoints;
	let rotation = 0, scale = 1;
	let meanA = { x: 0, y: 0 }, meanB = { x: 0, y: 0 };
	if (anchorsA.length >= 2) {
		const res = procrustesAlign(anchorsA, anchorsB);
		rotation = res.rotation;
		scale = res.scale;
		meanB = anchorsB.reduce(
			(acc, p) => ({ x: acc.x + p.x / anchorsB.length, y: acc.y + p.y / anchorsB.length }),
			{ x: 0, y: 0 }
		);
		meanA = anchorsA.reduce(
			(acc, p) => ({ x: acc.x + p.x / anchorsA.length, y: acc.y + p.y / anchorsA.length }),
			{ x: 0, y: 0 }
		);
		const cos = Math.cos(rotation), sin = Math.sin(rotation);
		samplePointsAligned = samplePoints.map((p) => {
			const x = p.x - meanB.x, y = p.y - meanB.y;
			return {
				x: meanA.x + scale * (x * cos - y * sin),
				y: meanA.y + scale * (x * sin + y * cos)
			};
		});
	}

	// Model×temp centroids: aggregate already-aligned sample positions
	const modelTempAligned: Point2D[] = modelTempCentroids.map((c) => {
		const matching: Point2D[] = [];
		for (let i = 0; i < allSamples.length; i++) {
			const s = allSamples[i];
			if (s.modelId === c.modelId && s.temperature === c.temperature) {
				matching.push(samplePointsAligned[i]);
			}
		}
		if (matching.length === 0) return { x: 0, y: 0 };
		const mx = matching.reduce((a, p) => a + p.x, 0) / matching.length;
		const my = matching.reduce((a, p) => a + p.y, 0) / matching.length;
		return { x: mx, y: my };
	});

	// ─── Per-prompt MDS projections (one per prompt) ───────────────────────
	console.log('Computing per-prompt projections...');
	const perPromptMeans = perPromptModelMeans(allSamples);
	const perPrompt: PromptProjection[] = [];
	for (const p of PROMPTS) {
		const mm = perPromptMeans.get(p.id);
		if (!mm) continue;
		// Use only models that pass the global coverage filter AND have data for this prompt
		const rows = fingerprints.filter((f) => mm.has(f.modelId));
		if (rows.length < 4) continue;
		const vs = rows.map((r) => mm.get(r.modelId)!);
		const pSim = pairwiseCosine(vs);
		const pDist = pSim.map((row) => row.map((s) => Math.max(0, 1 - s)));
		const pts = normalize2D(mds2d(pDist));

		// Mean pairwise distance — the prompt's discriminability
		let s = 0, n = 0;
		for (let i = 0; i < pSim.length; i++) {
			for (let j = i + 1; j < pSim.length; j++) {
				s += 1 - pSim[i][j];
				n++;
			}
		}
		const mean_distance = n > 0 ? s / n : 0;

		perPrompt.push({
			prompt_id: p.id,
			mean_distance,
			coords: rows.map((r, i) => ({ slug: r.modelId, x: pts[i].x, y: pts[i].y }))
		});
	}
	console.log(`  ${perPrompt.length} per-prompt projections.`);

	// ─── Community fine-tune axis ──────────────────────────────────────────
	// FT_axis = mean over (fine_tune, base_family_centroid) pairs of (ft_vec - base_centroid),
	// L2-normalized. Every model's scalar position is (model_vec · FT_axis).
	console.log('Computing community fine-tune axis...');
	const modelMean = new Map<string, number[]>();
	for (const f of fingerprints) modelMean.set(f.modelId, f.vector);

	// Also need full-corpus-level (not fingerprint-level) model mean vectors so the
	// axis is comparable across concat-dim fingerprints, but we'll use fingerprints
	// here for consistency.
	const familyCentroidFP = new Map<string, number[]>();
	const familyIds = new Map<string, string[]>();
	for (const m of MODELS) {
		if (!familyIds.has(m.family)) familyIds.set(m.family, []);
		familyIds.get(m.family)!.push(m.id);
	}
	for (const [fam, ids] of familyIds.entries()) {
		const vs = ids.map((id) => modelMean.get(id)).filter((v): v is number[] => !!v);
		if (vs.length === 0) continue;
		familyCentroidFP.set(fam, l2normalize(meanVector(vs)));
	}

	const ftDiffs: number[][] = [];
	for (const m of MODELS) {
		if (!m.base) continue;
		const baseFam = BASE_TO_FAMILY[m.base] ?? m.base;
		const vec = modelMean.get(m.id);
		const baseC = familyCentroidFP.get(baseFam);
		if (!vec || !baseC) continue;
		ftDiffs.push(subtract(vec, baseC));
	}
	let ftAxis = ftDiffs.length > 0 ? l2normalize(meanVector(ftDiffs)) : new Array(concatDim).fill(0);

	function dot(a: number[], b: number[]): number {
		let s = 0;
		for (let i = 0; i < a.length; i++) s += a[i] * b[i];
		return s;
	}

	const ftScores = new Map<string, number>();
	for (const f of fingerprints) {
		ftScores.set(f.modelId, dot(f.vector, ftAxis));
	}
	// Normalize scores to [-1, 1] for display
	let minFT = Infinity, maxFT = -Infinity;
	for (const v of ftScores.values()) {
		if (v < minFT) minFT = v;
		if (v > maxFT) maxFT = v;
	}
	const ftRange = maxFT - minFT || 1;
	for (const [k, v] of [...ftScores.entries()]) {
		ftScores.set(k, ((v - minFT) / ftRange) * 2 - 1);
	}

	// ─── Isolation — cos-distance from the global centroid ───────────────
	console.log('Computing isolation scores...');
	const globalCentroid = l2normalize(meanVector(fingerprints.map((f) => f.vector)));
	const isolation = new Map<string, number>();
	for (const f of fingerprints) {
		isolation.set(f.modelId, 1 - dot(f.vector, globalCentroid));
	}

	// ─── Spread direction at temp=1.0, projected into fingerprint MDS frame ─
	console.log('Computing per-model spread directions...');
	const spreadDir = new Map<string, { dx: number; dy: number }>();
	// For each model, use its temp=1.0 sample positions in the aligned 2D space.
	// Compute the 2D covariance matrix and take its top eigenvector.
	for (const f of fingerprints) {
		const positions: Point2D[] = [];
		for (let i = 0; i < allSamples.length; i++) {
			const s = allSamples[i];
			if (s.modelId !== f.modelId) continue;
			if (Math.abs(s.temperature - 1) > 0.01) continue;
			positions.push(samplePointsAligned[i]);
		}
		if (positions.length < 3) {
			spreadDir.set(f.modelId, { dx: 0, dy: 0 });
			continue;
		}
		const mx = positions.reduce((a, p) => a + p.x, 0) / positions.length;
		const my = positions.reduce((a, p) => a + p.y, 0) / positions.length;
		let sxx = 0, sxy = 0, syy = 0;
		for (const p of positions) {
			const dx = p.x - mx, dy = p.y - my;
			sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
		}
		const n = positions.length;
		sxx /= n; sxy /= n; syy /= n;
		// 2x2 eigendecomp closed form
		const trace = sxx + syy;
		const det = sxx * syy - sxy * sxy;
		const disc = Math.max(0, (trace * trace) / 4 - det);
		const lam = trace / 2 + Math.sqrt(disc);
		// eigenvector for lam
		let vx, vy;
		if (Math.abs(sxy) > 1e-9) {
			vx = lam - syy;
			vy = sxy;
		} else {
			if (sxx >= syy) { vx = 1; vy = 0; } else { vx = 0; vy = 1; }
		}
		const mag = Math.sqrt(vx * vx + vy * vy);
		const magScale = Math.sqrt(Math.max(0, lam));
		spreadDir.set(f.modelId, {
			dx: (vx / mag) * magScale,
			dy: (vy / mag) * magScale
		});
	}

	// ─── Assemble rows ─────────────────────────────────────────────────────
	const familyMap = new Map(MODELS.map((m) => [m.id, m]));

	const modelRows: ModelRow[] = fingerprints.map((f, i) => {
		const spec = familyMap.get(f.modelId);
		const sd = spreadDir.get(f.modelId) ?? { dx: 0, dy: 0 };
		return {
			slug: f.modelId,
			family: f.family,
			label: f.label,
			base: spec?.base,
			coverage: f.coverage,
			missing: f.missing,
			sample_count: f.sampleCount,
			volatility: f.volatility,
			x_umap: modelPoints[i].x,
			y_umap: modelPoints[i].y,
			ft_axis: ftScores.get(f.modelId) ?? 0,
			isolation: isolation.get(f.modelId) ?? 0,
			spread_dx: sd.dx,
			spread_dy: sd.dy
		};
	});

	const modelTempRows: ModelTempRow[] = modelTempCentroids.map((c, i) => ({
		slug: c.modelId,
		family: c.family,
		temperature: c.temperature,
		sample_count: c.count,
		x_umap: modelTempAligned[i].x,
		y_umap: modelTempAligned[i].y
	}));

	const sampleRows: SampleRow[] = allSamples.map((s, i) => ({
		slug: s.modelId,
		family: s.family,
		prompt_id: s.promptId,
		temperature: s.temperature,
		sample: s.sample,
		x_umap: samplePointsAligned[i].x,
		y_umap: samplePointsAligned[i].y
	}));

	// Filter lineage paths to only include present slugs.
	const presentSlugs = new Set(modelRows.map((r) => r.slug));
	const lineagePaths: LineagePath[] = LINEAGE_PATHS.map((lp) => ({
		...lp,
		slugs: lp.slugs.filter((s) => presentSlugs.has(s))
	})).filter((lp) => lp.slugs.length >= 2);

	const out: ProjectionFile = {
		generated_at: Date.now(),
		n_models: fingerprints.length,
		n_prompts: PROMPTS.length,
		n_samples_total: allSamples.length,
		embedding_dim_per_prompt: EMBEDDING_DIMENSIONS,
		concat_dim: concatDim,
		models: modelRows,
		model_temps: modelTempRows,
		samples: sampleRows,
		model_knn_edges: modelKnn,
		pairwise_cosine: sim,
		per_prompt: perPrompt,
		lineage_paths: lineagePaths
	};

	writeFileSync(PROJECTION_PATH, JSON.stringify(out));
	const bytes = JSON.stringify(out).length;
	console.log(`\nWrote ${PROJECTION_PATH} — ${(bytes / 1024 / 1024).toFixed(1)} MB`);
	console.log(`  models: ${modelRows.length}`);
	console.log(`  model×temp centroids: ${modelTempRows.length}`);
	console.log(`  samples: ${sampleRows.length}`);
	console.log(`  per-prompt projections: ${perPrompt.length}`);
	console.log(`  lineage paths: ${lineagePaths.length}`);
	console.log(`  knn edges: ${modelKnn.length}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
