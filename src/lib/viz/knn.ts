/**
 * Naive exact k-nearest-neighbors for small N. For 45 model centroids this is
 * trivially O(N²) and runs in microseconds. For 15K sample-level points we run
 * it at build time (not per-request), so still fine.
 */

import { cosine } from './similarity.ts';

export interface KnnEdge {
	from: number;
	to: number;
	similarity: number;
}

/**
 * For each vector, find indices of its top-k most similar other vectors.
 * Returns a flat list of edges (from, to, similarity) with `from < to` NOT enforced —
 * edges can be asymmetric (knn is directional). Dedup with Set on (min, max) if needed.
 */
export function knnEdges(vectors: number[][], k: number): KnnEdge[] {
	const n = vectors.length;
	const edges: KnnEdge[] = [];

	for (let i = 0; i < n; i++) {
		const scored: { j: number; s: number }[] = [];
		for (let j = 0; j < n; j++) {
			if (i === j) continue;
			scored.push({ j, s: cosine(vectors[i], vectors[j]) });
		}
		scored.sort((a, b) => b.s - a.s);
		for (const { j, s } of scored.slice(0, k)) {
			edges.push({ from: i, to: j, similarity: s });
		}
	}

	return edges;
}
