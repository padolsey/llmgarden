/**
 * Thin adapter around regl-scatterplot. Handles:
 *   - seeding points with x/y/category/id/size
 *   - category palette
 *   - external filtering (show/hide subsets)
 *   - hover + click callbacks
 *
 * All coordinate math: points come in with x/y in [-1, 1]; we pass through.
 */

import createScatterplot from 'regl-scatterplot';
import { FAMILY_COLORS, colorFor } from './palette.ts';

export interface ScatterPoint {
	id: number;
	x: number;
	y: number;
	/** Family slug used to look up a color. */
	family: string;
	/** Point size multiplier (1 = default). */
	size?: number;
	/** Arbitrary metadata for hover/click callbacks. */
	meta?: Record<string, unknown>;
}

export interface ScatterHandle {
	update(points: ScatterPoint[]): void;
	setFilter(predicate: (p: ScatterPoint) => boolean): void;
	clearFilter(): void;
	destroy(): void;
	resize(): void;
}

export interface ScatterOptions {
	pointSize?: number;
	opacity?: number;
	backgroundColor?: string;
	onHover?: (point: ScatterPoint | null) => void;
	onSelect?: (point: ScatterPoint | null) => void;
	isDark?: () => boolean;
}

function hexToRgbaFloats(hex: string, a = 1): [number, number, number, number] {
	const m = hex.replace('#', '');
	const r = parseInt(m.slice(0, 2), 16) / 255;
	const g = parseInt(m.slice(2, 4), 16) / 255;
	const b = parseInt(m.slice(4, 6), 16) / 255;
	return [r, g, b, a];
}

export function createScatter(canvas: HTMLCanvasElement, opts: ScatterOptions = {}): ScatterHandle {
	const families = Object.keys(FAMILY_COLORS);
	const familyIdx = new Map(families.map((f, i) => [f, i]));
	const palette = families.map((f) => hexToRgbaFloats(FAMILY_COLORS[f], opts.opacity ?? 0.6));

	const bgColor = hexToRgbaFloats(opts.backgroundColor ?? '#0b0b10', 1);
	const scatter = createScatterplot({
		canvas,
		width: 'auto',
		height: 'auto',
		pointSize: opts.pointSize ?? 3,
		pointSizeSelected: (opts.pointSize ?? 3) * 2,
		pointOutlineWidth: 0,
		backgroundColor: bgColor,
		colorBy: 'valueA',
		pointColor: palette
	});

	let pointsRef: ScatterPoint[] = [];

	scatter.subscribe('pointOver', (pointIdx: number) => {
		opts.onHover?.(pointsRef[pointIdx] ?? null);
	});
	scatter.subscribe('pointOut', () => opts.onHover?.(null));
	scatter.subscribe('select', (e: { points: number[] }) => {
		if (e.points.length === 0) opts.onSelect?.(null);
		else opts.onSelect?.(pointsRef[e.points[0]] ?? null);
	});

	function update(points: ScatterPoint[]) {
		pointsRef = points;
		// regl-scatterplot's `Points` type is number[][]: [x, y, categoryIdx, value].
		const rows: number[][] = new Array(points.length);
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			rows[i] = [p.x, p.y, familyIdx.get(p.family) ?? 0, 0.5];
		}
		scatter.draw(rows);
	}

	function setFilter(predicate: (p: ScatterPoint) => boolean) {
		const indices: number[] = [];
		for (let i = 0; i < pointsRef.length; i++) {
			if (predicate(pointsRef[i])) indices.push(i);
		}
		scatter.filter(indices);
	}

	function clearFilter() {
		scatter.unfilter();
	}

	function resize() {
		// regl-scatterplot handles its own resize internally via ResizeObserver
	}

	return {
		update,
		setFilter,
		clearFilter,
		destroy: () => scatter.destroy(),
		resize
	};
}
