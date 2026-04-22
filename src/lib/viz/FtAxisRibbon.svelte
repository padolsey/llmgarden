<script lang="ts">
	import { colorFor } from './palette';

	interface Model {
		slug: string;
		label: string;
		family: string;
		ft_axis: number;
		base?: string;
	}

	let {
		models,
		activeFamilies,
		onHover
	}: {
		models: Model[];
		activeFamilies: Set<string>;
		onHover?: (slug: string | null) => void;
	} = $props();

	// Guaranteed in [-1, 1] by project.ts. Map to 0..100% along the ribbon.
	function posPct(ft: number) {
		return ((ft + 1) / 2) * 100;
	}

	function isActive(fam: string): boolean {
		return activeFamilies.size === 0 || activeFamilies.has(fam);
	}

	// Collision-avoidance: assign each model a vertical "lane" so labels don't overlap
	interface Placed extends Model {
		lane: number;
	}
	const placed = $derived((): Placed[] => {
		const sorted = [...models].sort((a, b) => a.ft_axis - b.ft_axis);
		const out: Placed[] = [];
		const laneOccupancyPct = [-Infinity, -Infinity, -Infinity, -Infinity];
		const LABEL_WIDTH_PCT = 12; // approximate label+dot width as a percent of ribbon width
		for (const m of sorted) {
			const p = posPct(m.ft_axis);
			let lane = 0;
			for (let i = 0; i < laneOccupancyPct.length; i++) {
				if (p > laneOccupancyPct[i] + LABEL_WIDTH_PCT) { lane = i; break; }
				if (i === laneOccupancyPct.length - 1) lane = i;
			}
			laneOccupancyPct[lane] = p;
			out.push({ ...m, lane });
		}
		return out;
	});

	const N_LANES = 4;
	const LANE_HEIGHT = 22;
</script>

<section class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-6">
	<div class="mb-3">
		<h2 class="text-sm font-semibold">Community fine-tune axis</h2>
		<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-3xl">
			Axis direction = mean of <code>(fine-tune − base-family-centroid)</code> across all known fine-tune/base pairs in the corpus.
			Models to the <em>right</em> sound more like a community-style fine-tune (Hermes / Magnum / Euryale / Rocinante / Goliath);
			models to the <em>left</em> sound more like a flagship frontier model.
		</p>
	</div>
	<div class="relative">
		<!-- Axis line -->
		<div class="absolute inset-x-0 top-1/2 h-px bg-zinc-300 dark:bg-zinc-700"></div>
		<!-- Endpoint labels -->
		<div class="absolute left-0 -top-3 text-[10px] text-zinc-500 dark:text-zinc-400">← flagship voice</div>
		<div class="absolute right-0 -top-3 text-[10px] text-zinc-500 dark:text-zinc-400">community fine-tune voice →</div>
		<div class="relative" style="height: {N_LANES * LANE_HEIGHT * 2 + 8}px">
			{#each placed() as m}
				{@const dim = !isActive(m.family)}
				{@const topOffset = (m.lane - (N_LANES - 1) / 2) * LANE_HEIGHT}
				<div
					class="absolute group"
					style="left: {posPct(m.ft_axis)}%; top: calc(50% + {topOffset}px); transform: translate(-50%, -50%); opacity: {dim ? 0.2 : 1}"
					onmouseenter={() => onHover?.(m.slug)}
					onmouseleave={() => onHover?.(null)}
					role="img"
					aria-label={m.label}
				>
					<div class="w-1.5 h-1.5 rounded-full mx-auto" style="background: {colorFor(m.family)}"></div>
					<div class="absolute left-1/2 -translate-x-1/2 top-2 text-[9px] whitespace-nowrap text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
						{m.label}
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
