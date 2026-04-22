/**
 * UMAP 2D projection wrappers. Used at build time to precompute the projection
 * coordinates committed to data/projection.json.
 */
import { UMAP } from 'umap-js';

export interface Point2D {
	x: number;
	y: number;
}

export interface UmapOpts {
	seed?: number;
	nNeighbors?: number;
	minDist?: number;
	spread?: number;
}

function seededRng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};
}

export function umap2d(vectors: number[][], opts: UmapOpts = {}): Point2D[] {
	const n = vectors.length;
	if (n < 3) throw new Error(`UMAP needs >= 3 points, got ${n}`);

	const seed = opts.seed ?? 42;
	const nNeighbors = opts.nNeighbors ?? Math.min(15, n - 1);
	const minDist = opts.minDist ?? 0.3;
	const spread = opts.spread ?? 1.0;

	const umap = new UMAP({
		nNeighbors,
		minDist,
		nComponents: 2,
		spread,
		random: seededRng(seed)
	});

	const coords = umap.fit(vectors);
	return rescaleToUnit(coords.map((c) => ({ x: c[0], y: c[1] })));
}

/**
 * Rescale a 2D point cloud into roughly [-1, 1] × [-1, 1], preserving aspect.
 */
export function rescaleToUnit(points: Point2D[]): Point2D[] {
	if (points.length === 0) return points;
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const span = Math.max(maxX - minX, maxY - minY) || 1;
	const scale = 1.8 / span;
	return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

/**
 * Apply a 2D affine transformation to align `B` with `A` via Procrustes (allowing
 * translation + uniform scale + rotation). Used to keep sample-level UMAP visually
 * aligned with centroid-level UMAP so they feel like the same map.
 */
export function procrustesAlign(
	A: Point2D[],
	B: Point2D[]
): { aligned: Point2D[]; rotation: number; scale: number } {
	if (A.length !== B.length) {
		throw new Error(`procrustesAlign: length mismatch ${A.length} vs ${B.length}`);
	}
	const n = A.length;

	const meanA = { x: 0, y: 0 };
	const meanB = { x: 0, y: 0 };
	for (let i = 0; i < n; i++) {
		meanA.x += A[i].x; meanA.y += A[i].y;
		meanB.x += B[i].x; meanB.y += B[i].y;
	}
	meanA.x /= n; meanA.y /= n; meanB.x /= n; meanB.y /= n;

	let sxx = 0, sxy = 0, syx = 0, syy = 0, normB = 0, normA = 0;
	for (let i = 0; i < n; i++) {
		const ax = A[i].x - meanA.x, ay = A[i].y - meanA.y;
		const bx = B[i].x - meanB.x, by = B[i].y - meanB.y;
		sxx += ax * bx; sxy += ax * by; syx += ay * bx; syy += ay * by;
		normB += bx * bx + by * by;
		normA += ax * ax + ay * ay;
	}

	// Optimal rotation from 2x2 SVD shortcut.
	const a = sxx + syy;
	const b = sxy - syx;
	const theta = Math.atan2(b, a);
	const c = Math.cos(theta), s = Math.sin(theta);
	const scale = normB === 0 ? 1 : Math.sqrt(normA / normB);

	const aligned = B.map((p) => {
		const x = p.x - meanB.x, y = p.y - meanB.y;
		return {
			x: meanA.x + scale * (x * c - y * s),
			y: meanA.y + scale * (x * s + y * c)
		};
	});

	return { aligned, rotation: theta, scale };
}
