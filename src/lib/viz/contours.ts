/**
 * Density-contour utilities for the sample cloud. Takes a set of 2D points
 * (already in [-1, 1] coord space) and returns SVG path strings representing
 * the 2D density distribution at specified thresholds.
 *
 * We use d3-contour's `contourDensity`, which is a standard kernel density
 * estimator over a regular grid.
 */

import { contourDensity, geoPath } from 'd3';
import type { ContourMultiPolygon } from 'd3';

// We only import the parts we need to keep the bundle small.

export interface Point2D {
	x: number;
	y: number;
}

/**
 * Compute density contours for a set of 2D points. Returns SVG path strings
 * (one per threshold) in the input coordinate space.
 *
 * @param points  input points, already in [-1, 1] space (or any consistent space)
 * @param viewSize side length of the SVG viewBox we render into
 * @param bandwidth KDE bandwidth (in SVG px, tune for visual density)
 * @param thresholds number of contour levels
 */
export function densityPaths(
	points: Point2D[],
	viewSize: number,
	bandwidth = 14,
	thresholds = 6
): string[] {
	if (points.length === 0) return [];
	const toSvgX = (x: number) => ((x + 1.15) / 2.3) * viewSize;
	const toSvgY = (y: number) => ((1.15 - y) / 2.3) * viewSize;

	const projected = points.map((p) => ({ x: toSvgX(p.x), y: toSvgY(p.y) }));

	const density = contourDensity<{ x: number; y: number }>()
		.x((d) => d.x)
		.y((d) => d.y)
		.size([viewSize, viewSize])
		.bandwidth(bandwidth)
		.thresholds(thresholds);

	const contours = density(projected);
	const toPath = geoPath();
	return contours.map((c: ContourMultiPolygon) => toPath(c) ?? '');
}
