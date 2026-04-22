<script lang="ts">
	import { colorFor } from './palette';

	interface Model {
		slug: string;
		label: string;
		family: string;
		isolation: number;
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

	const sorted = $derived([...models].sort((a, b) => b.isolation - a.isolation));
	const maxIso = $derived(Math.max(...sorted.map((m) => m.isolation), 0.0001));

	function isActive(fam: string): boolean {
		return activeFamilies.size === 0 || activeFamilies.has(fam);
	}
</script>

<section class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-6">
	<div class="mb-3">
		<h2 class="text-sm font-semibold">Isolation — distance from the global corpus centroid</h2>
		<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
			How lonely is this model in latent space? Larger bar = further from the mean voice of all models.
			Outliers at the top speak in genuinely distinct ways.
		</p>
	</div>
	<div class="space-y-0.5 max-w-2xl">
		{#each sorted as m}
			{@const pct = (m.isolation / maxIso) * 100}
			{@const dim = !isActive(m.family)}
			<div
				class="flex items-center gap-2 text-[11px]"
				style="opacity: {dim ? 0.25 : 1}"
				onmouseenter={() => onHover?.(m.slug)}
				onmouseleave={() => onHover?.(null)}
				role="img"
				aria-label={m.label}
			>
				<span class="inline-block w-2 h-2 rounded-full flex-none" style="background: {colorFor(m.family)}"></span>
				<span class="text-zinc-700 dark:text-zinc-300 w-44 truncate">{m.label}</span>
				<div class="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
					<div class="absolute inset-y-0 left-0 rounded-full" style="width: {pct}%; background: {colorFor(m.family)}"></div>
				</div>
				<span class="tabular-nums text-zinc-500 dark:text-zinc-400 w-12 text-right">{m.isolation.toFixed(3)}</span>
			</div>
		{/each}
	</div>
</section>
