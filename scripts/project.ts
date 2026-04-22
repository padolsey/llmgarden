/**
 * Build data/projection.json from the multi-sample embedding corpus.
 *
 * Emits three levels of structure:
 *   1. Model-level fingerprints (one point per model) — UMAP + pairwise cosine.
 *   2. Model × temperature centroids (~N × T points) — used for "temperature
 *      trajectory" polylines showing how each model drifts across temperatures.
 *   3. Per-sample points (~N × P × T × S points, thousands) — used for the
 *      WebGL "all-samples cloud" view.
 *
 * Also: kNN at the model-centroid level (k=5), intra-model volatility, coverage
 * per model.
 *
 * The sample-level projection is Procrustes-aligned to the fingerprint projection
 * so both views feel like "the same map" even though they're separately UMAPped.
 */
import { writeFileSync } from 'node:fs';
import {
	loadAllSamples,
	loadModelFingerprints,
	l2normalize,
	meanVector,
	pairwiseCosine,
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
	pairwise_cosine: number[][]; // indexed by models[] order
}

async function main() {
	console.log('Loading embeddings...');
	const fingerprints = loadModelFingerprints(0.8);
	if (fingerprints.length < 3) {
		console.error(`Only ${fingerprints.length} models have >=80% coverage — need >=3 for UMAP.`);
		process.exit(1);
	}
	console.log(`${fingerprints.length} models pass coverage filter.`);

	const concatDim = fingerprints[0].vector.length;

	// ---- Pairwise model cosine
	console.log('Computing pairwise cosine...');
	const sim = pairwiseCosine(fingerprints.map((f) => f.vector));

	// ---- Model fingerprint scatter via classical MDS on cosine distance.
	// MDS is exact at small N (~45 models) and avoids UMAP's degenerate-tree
	// problem on sparse zero-filled fingerprints.
	console.log('Running MDS on model fingerprints...');
	const cosDist = sim.map((row) => row.map((s) => Math.max(0, 1 - s)));
	const modelPoints = normalize2D(mds2d(cosDist));

	// ---- kNN at the model-centroid level
	console.log('kNN at model-centroid level...');
	const idxEdges = knnEdges(fingerprints.map((f) => f.vector), 5);
	const modelKnn: ModelEdge[] = idxEdges.map((e) => ({
		from: fingerprints[e.from].slug,
		to: fingerprints[e.to].slug,
		similarity: e.similarity
	}));

	// ---- Model × temperature centroids
	console.log('Computing per-(model, temperature) centroids...');
	const allSamples = loadAllSamples();
	console.log(`  ${allSamples.length} total samples on disk.`);

	const modelTempCentroids: { modelId: string; family: string; temperature: number; vec: number[]; count: number }[] = [];
	const byModelTemp = new Map<string, SamplePoint[]>();
	for (const s of allSamples) {
		const k = `${s.modelId}::${s.temperature}`;
		if (!byModelTemp.has(k)) byModelTemp.set(k, []);
		byModelTemp.get(k)!.push(s);
	}
	for (const [key, ss] of byModelTemp.entries()) {
		if (ss.length < 3) continue; // too few samples, skip centroid
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
	console.log(`  ${modelTempCentroids.length} (model, temp) centroids.`);

	// ---- Per-sample projection via UMAP (all samples at once)
	console.log(`Running UMAP on ${allSamples.length} individual samples (${allSamples[0]?.vector.length ?? 0}-d)...`);
	const samplePoints = umap2d(
		allSamples.map((s) => s.vector),
		{ nNeighbors: Math.min(30, Math.max(5, Math.floor(Math.sqrt(allSamples.length)))), minDist: 0.1 }
	);

	// Align the sample UMAP to the fingerprint MDS via per-model centroids. We
	// match each model's mean sample-UMAP position to its MDS position and
	// recover an optimal similarity transform (rotation + scale + translation).
	console.log('Aligning sample cloud to fingerprint MDS frame...');
	const sampleCentroidsByModel = new Map<string, Point2D[]>();
	for (let i = 0; i < allSamples.length; i++) {
		const m = allSamples[i].modelId;
		if (!sampleCentroidsByModel.has(m)) sampleCentroidsByModel.set(m, []);
		sampleCentroidsByModel.get(m)!.push(samplePoints[i]);
	}

	const anchorsA: Point2D[] = []; // MDS-frame anchors (the "truth")
	const anchorsB: Point2D[] = []; // sample-UMAP-frame anchors (to be transformed)
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
	let alignedMeanA = { x: 0, y: 0 };
	let alignedMeanB = { x: 0, y: 0 };
	let alignedRot = 0;
	let alignedScale = 1;
	if (anchorsA.length >= 2) {
		const { rotation, scale } = procrustesAlign(anchorsA, anchorsB);
		alignedRot = rotation;
		alignedScale = scale;
		alignedMeanB = anchorsB.reduce(
			(acc, p) => ({ x: acc.x + p.x / anchorsB.length, y: acc.y + p.y / anchorsB.length }),
			{ x: 0, y: 0 }
		);
		alignedMeanA = anchorsA.reduce(
			(acc, p) => ({ x: acc.x + p.x / anchorsA.length, y: acc.y + p.y / anchorsA.length }),
			{ x: 0, y: 0 }
		);
		const cos = Math.cos(alignedRot), sin = Math.sin(alignedRot);
		samplePointsAligned = samplePoints.map((p) => {
			const x = p.x - alignedMeanB.x, y = p.y - alignedMeanB.y;
			return {
				x: alignedMeanA.x + alignedScale * (x * cos - y * sin),
				y: alignedMeanA.y + alignedScale * (x * sin + y * cos)
			};
		});
	}

	// ---- Model × temperature centroids: aggregate *already-aligned* sample
	// projections. This keeps temp trajectories consistent with the sample cloud
	// and with the model-level MDS frame — all three views live on the same map.
	const modelTempAligned = modelTempCentroids.map((c) => {
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

	const modelPointsAligned = modelPoints;

	// ---- Assemble rows

	const familyMap = new Map(MODELS.map((m) => [m.id, m]));

	const modelRows: ModelRow[] = fingerprints.map((f, i) => {
		const spec = familyMap.get(f.modelId);
		return {
			slug: f.modelId,
			family: f.family,
			label: f.label,
			base: spec?.base,
			coverage: f.coverage,
			missing: f.missing,
			sample_count: f.sampleCount,
			volatility: f.volatility,
			x_umap: modelPointsAligned[i].x,
			y_umap: modelPointsAligned[i].y
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
		pairwise_cosine: sim
	};

	writeFileSync(PROJECTION_PATH, JSON.stringify(out));
	const bytes = JSON.stringify(out).length;
	console.log(`\nWrote ${PROJECTION_PATH} — ${(bytes / 1024 / 1024).toFixed(1)} MB`);
	console.log(`  models: ${modelRows.length}`);
	console.log(`  model×temp centroids: ${modelTempRows.length}`);
	console.log(`  samples: ${sampleRows.length}`);
	console.log(`  knn edges: ${modelKnn.length}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
