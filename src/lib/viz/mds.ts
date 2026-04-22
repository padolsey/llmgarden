/**
 * Classical multidimensional scaling (MDS) for small-N: takes a pairwise
 * distance matrix and returns 2D coordinates that best preserve those
 * distances in an L2 sense.
 *
 * Used for the model-level scatter (N≈45) where UMAP is overkill and has
 * degenerate-input issues with zero-filled sparse fingerprints. MDS is exact,
 * deterministic, and rotation-free.
 *
 * Implementation:
 *   B = -½ · H · D² · H   where H = I − 1/N · 11ᵀ
 *   Eigendecompose B (Jacobi rotations, O(N³))
 *   Coords = top-2 eigenvectors · √top-2 eigenvalues
 */

export interface Point2D {
	x: number;
	y: number;
}

export function mds2d(dist: number[][]): Point2D[] {
	const n = dist.length;

	// Double-center the squared distance matrix.
	const D2 = dist.map((row) => row.map((d) => d * d));

	const rowMean = new Array(n).fill(0);
	const colMean = new Array(n).fill(0);
	let grandMean = 0;
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			rowMean[i] += D2[i][j];
			colMean[j] += D2[i][j];
			grandMean += D2[i][j];
		}
	}
	for (let i = 0; i < n; i++) {
		rowMean[i] /= n;
		colMean[i] /= n;
	}
	grandMean /= n * n;

	const B: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			B[i][j] = -0.5 * (D2[i][j] - rowMean[i] - colMean[j] + grandMean);
		}
	}

	const { values, vectors } = jacobiEigen(B);

	// Pair eigenvalues with columns and sort descending
	const idx = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
	const i0 = idx[0], i1 = idx[1];
	const s0 = Math.sqrt(Math.max(0, values[i0]));
	const s1 = Math.sqrt(Math.max(0, values[i1]));

	const out: Point2D[] = [];
	for (let i = 0; i < n; i++) {
		out.push({ x: vectors[i][i0] * s0, y: vectors[i][i1] * s1 });
	}
	return out;
}

/**
 * Symmetric eigendecomposition via Jacobi rotations.
 * Returns eigenvalues (on diagonal) and eigenvectors (columns of V).
 *
 * O(N³) per sweep, converges in O(log N) sweeps for well-behaved matrices.
 * Fine for N up to ~200.
 */
function jacobiEigen(A: number[][]): { values: number[]; vectors: number[][] } {
	const n = A.length;
	// Deep copy to avoid mutating input.
	const M: number[][] = A.map((r) => r.slice());
	// V starts as identity
	const V: number[][] = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
	);

	const maxSweeps = 100;
	const tol = 1e-10;

	for (let sweep = 0; sweep < maxSweeps; sweep++) {
		// Find largest off-diagonal absolute value.
		let p = 0, q = 1, max = Math.abs(M[0][1]);
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const v = Math.abs(M[i][j]);
				if (v > max) { max = v; p = i; q = j; }
			}
		}
		if (max < tol) break;

		// Compute rotation angle.
		const app = M[p][p], aqq = M[q][q], apq = M[p][q];
		let theta: number;
		if (Math.abs(app - aqq) < 1e-30) {
			theta = Math.PI / 4;
		} else {
			theta = 0.5 * Math.atan2(2 * apq, app - aqq);
		}
		const c = Math.cos(theta), s = Math.sin(theta);

		// Apply rotation to rows/cols p and q.
		for (let i = 0; i < n; i++) {
			const mip = M[i][p], miq = M[i][q];
			M[i][p] = c * mip + s * miq;
			M[i][q] = -s * mip + c * miq;
		}
		for (let j = 0; j < n; j++) {
			const mpj = M[p][j], mqj = M[q][j];
			M[p][j] = c * mpj + s * mqj;
			M[q][j] = -s * mpj + c * mqj;
		}

		// Update eigenvector matrix.
		for (let i = 0; i < n; i++) {
			const vip = V[i][p], viq = V[i][q];
			V[i][p] = c * vip + s * viq;
			V[i][q] = -s * vip + c * viq;
		}
	}

	const values = new Array(n);
	for (let i = 0; i < n; i++) values[i] = M[i][i];
	return { values, vectors: V };
}

export function normalize2D(points: Point2D[]): Point2D[] {
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
