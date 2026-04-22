<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { ScatterHandle, ScatterPoint } from './webgl-scatter';
	import { FAMILY_COLORS, colorFor } from './palette';

	interface Sample {
		slug: string;
		family: string;
		prompt_id: string;
		temperature: number;
		sample: number;
		x_umap: number;
		y_umap: number;
	}

	let {
		samples,
		activeFamilies,
		onHover
	}: {
		samples: Sample[];
		activeFamilies: Set<string>;
		onHover?: (slug: string | null, family: string | null, promptId: string | null, temp: number | null) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let container = $state<HTMLDivElement | null>(null);
	let scatter: ScatterHandle | null = null;
	let contourSize = $state({ w: 400, h: 400 });
	let contoursByFamily = $state<{ family: string; paths: string[] }[]>([]);

	function isActive(fam: string): boolean {
		return activeFamilies.size === 0 || activeFamilies.has(fam);
	}

	async function mount() {
		if (!canvas) return;
		const { createScatter } = await import('./webgl-scatter');
		scatter = createScatter(canvas, {
			pointSize: 2.2,
			opacity: 0.7,
			backgroundColor: document.documentElement.classList.contains('dark') ? '#09090b' : '#fafafa',
			onHover: (p) => {
				if (!p?.meta) {
					onHover?.(null, null, null, null);
				} else {
					onHover?.(
						String(p.meta.slug),
						p.family,
						String(p.meta.prompt_id),
						Number(p.meta.temperature)
					);
				}
			}
		});
		applyPoints();
	}

	function applyPoints() {
		if (!scatter) return;
		const points: ScatterPoint[] = samples.map((s, i) => ({
			id: i,
			x: s.x_umap,
			y: s.y_umap,
			family: s.family,
			meta: {
				slug: s.slug,
				prompt_id: s.prompt_id,
				temperature: s.temperature,
				sample: s.sample
			}
		}));
		scatter.update(points);
	}

	async function recomputeContours() {
		if (samples.length === 0) {
			contoursByFamily = [];
			return;
		}
		// Dynamic import so d3 stays out of SSR
		const { contourDensity } = await import('d3-contour');
		const w = contourSize.w;
		const h = contourSize.h;
		const toX = (x: number) => ((x + 1.15) / 2.3) * w;
		const toY = (y: number) => ((1.15 - y) / 2.3) * h;

		const byFamily = new Map<string, { x: number; y: number }[]>();
		for (const s of samples) {
			if (!byFamily.has(s.family)) byFamily.set(s.family, []);
			byFamily.get(s.family)!.push({ x: toX(s.x_umap), y: toY(s.y_umap) });
		}

		const out: { family: string; paths: string[] }[] = [];
		for (const [family, pts] of byFamily.entries()) {
			if (pts.length < 6) continue; // too few for meaningful density
			const density = contourDensity<{ x: number; y: number }>()
				.x((d) => d.x)
				.y((d) => d.y)
				.size([w, h])
				.bandwidth(18)
				.thresholds(4);
			const contours = density(pts);
			// Convert to SVG path strings using manual serialization (avoid d3-geo dep).
			const paths = contours.map((c) => contourToSvg(c));
			out.push({ family, paths });
		}
		contoursByFamily = out;
	}

	function contourToSvg(c: { coordinates: number[][][][] }): string {
		const parts: string[] = [];
		for (const polygon of c.coordinates) {
			for (const ring of polygon) {
				if (ring.length < 3) continue;
				parts.push(`M ${ring.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ')} Z`);
			}
		}
		return parts.join(' ');
	}

	// Resize observer for container size → contour SVG viewBox alignment.
	onMount(() => {
		mount();
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				contourSize = { w: e.contentRect.width, h: e.contentRect.height };
			}
		});
		if (container) ro.observe(container);
		return () => ro.disconnect();
	});

	// React to changes
	$effect(() => {
		applyPoints();
	});

	$effect(() => {
		if (!scatter) return;
		if (activeFamilies.size === 0) scatter.clearFilter();
		else scatter.setFilter((p) => activeFamilies.has(p.family));
	});

	$effect(() => {
		// Re-run contour computation whenever samples/size change
		contourSize; samples;
		recomputeContours();
	});

	onDestroy(() => {
		scatter?.destroy();
	});
</script>

<div bind:this={container} class="relative w-full h-full">
	<canvas bind:this={canvas} class="absolute inset-0 w-full h-full block"></canvas>
	<!-- SVG overlay for density contours -->
	{#if contoursByFamily.length > 0}
		<svg
			class="absolute inset-0 w-full h-full pointer-events-none"
			viewBox="0 0 {contourSize.w} {contourSize.h}"
			preserveAspectRatio="none"
		>
			{#each contoursByFamily as fam}
				{@const active = isActive(fam.family)}
				{@const color = FAMILY_COLORS[fam.family] ?? '#71717a'}
				<g opacity={active ? 0.35 : 0.05}>
					{#each fam.paths as path, i}
						<path
							d={path}
							fill="none"
							stroke={color}
							stroke-width={1 + i * 0.3}
							stroke-linejoin="round"
						/>
					{/each}
				</g>
			{/each}
		</svg>
	{/if}
</div>
