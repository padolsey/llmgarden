/**
 * UMAP 2D projection wrapper. For ~28 points we set nNeighbors small.
 */
import { UMAP } from 'umap-js';

export interface Point2D {
	x: number;
	y: number;
}

export function umap2d(vectors: number[][], opts: { seed?: number } = {}): Point2D[] {
	const n = vectors.length;
	if (n < 3) throw new Error(`UMAP needs >= 3 points, got ${n}`);

	// seeded RNG for reproducibility
	const seed = opts.seed ?? 42;
	let s = seed;
	function rng() {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	}

	const umap = new UMAP({
		nNeighbors: Math.min(5, n - 1),
		minDist: 0.3,
		nComponents: 2,
		spread: 1.0,
		random: rng
	});

	const coords = umap.fit(vectors);
	return rescaleToUnit(coords.map((c) => ({ x: c[0], y: c[1] })));
}

/**
 * Rescale a 2D point cloud into roughly [-1, 1] x [-1, 1] with a little margin,
 * preserving aspect ratio.
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
	const scale = 1.8 / span; // leaves ~10% margin
	return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}
