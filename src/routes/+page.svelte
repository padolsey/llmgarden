<script lang="ts">
	import { FAMILY_COLORS, colorFor } from '$lib/viz/palette';

	let { data } = $props();

	const projection = $derived(data.data);

	let hovered = $state<string | null>(null);
	const hoveredModel = $derived(
		hovered ? projection?.models.find((m) => m.slug === hovered) ?? null : null
	);

	// SVG coordinate space — [-1, 1] padded to [-1.1, 1.1] so circles near edges aren't clipped.
	const VIEW = 220; // viewBox size — square
	function svgX(x: number) { return ((x + 1.1) / 2.2) * VIEW; }
	function svgY(y: number) { return ((1.1 - y) / 2.2) * VIEW; } // flip so +y is "up"

	const families = $derived(
		projection
			? [...new Set(projection.models.map((m) => m.family))].sort()
			: []
	);
</script>

<main class="px-5 py-6 max-w-6xl mx-auto">
	<section class="mb-6">
		<h1 class="text-xl font-semibold mb-1">Embedding-space map of large language models</h1>
		<p class="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl leading-relaxed">
			Each model answered the same {projection?.n_prompts_used ?? '…'} prompts. Each response
			was embedded with <code class="text-xs">text-embedding-3-small</code>; each model's
			fingerprint is the concatenation of its response embeddings, L2-normalized. UMAP
			projects those fingerprints to 2D. Nearby points wrote in a similar style across the
			whole prompt battery — clusters reveal training-family lineage.
		</p>
	</section>

	{#if !projection}
		<div class="rounded border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500">
			No projection yet. Run <code>pnpm harness</code> then <code>pnpm project</code>.
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6">
			<!-- Scatter plot -->
			<div class="relative">
				<svg viewBox="0 0 {VIEW} {VIEW}" class="w-full aspect-square border border-zinc-200 dark:border-zinc-800 rounded bg-zinc-50 dark:bg-zinc-950">
					<!-- subtle grid -->
					{#each [0.25, 0.5, 0.75] as frac}
						<line x1={frac * VIEW} y1="0" x2={frac * VIEW} y2={VIEW} class="stroke-zinc-200 dark:stroke-zinc-900" stroke-width="0.3" />
						<line x1="0" y1={frac * VIEW} x2={VIEW} y2={frac * VIEW} class="stroke-zinc-200 dark:stroke-zinc-900" stroke-width="0.3" />
					{/each}

					{#each projection.models as m (m.slug)}
						{@const cx = svgX(m.x_umap)}
						{@const cy = svgY(m.y_umap)}
						{@const isHovered = hovered === m.slug}
						<g
							role="button"
							tabindex="0"
							aria-label={m.label}
							onmouseenter={() => (hovered = m.slug)}
							onmouseleave={() => (hovered = null)}
							onfocus={() => (hovered = m.slug)}
							onblur={() => (hovered = null)}
							style="cursor: pointer"
						>
							<circle {cx} {cy} r={isHovered ? 3.8 : 2.6} fill={colorFor(m.family)} stroke="white" stroke-width="0.6" class="dark:stroke-zinc-900 transition-all" />
							<text
								x={cx + 4}
								y={cy + 1.5}
								class="fill-zinc-700 dark:fill-zinc-300 pointer-events-none select-none"
								font-size="3.2"
								style="font-family: ui-sans-serif, system-ui, sans-serif"
							>
								{m.label}
							</text>
						</g>
					{/each}
				</svg>
			</div>

			<!-- Sidebar: legend + tooltip -->
			<aside class="flex flex-col gap-5 text-sm">
				<div>
					<h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Families</h2>
					<ul class="space-y-1">
						{#each families as fam}
							<li class="flex items-center gap-2">
								<span class="inline-block w-3 h-3 rounded-full" style="background: {FAMILY_COLORS[fam] ?? '#71717a'}"></span>
								<span class="text-zinc-700 dark:text-zinc-300">{projection.family_labels[fam] ?? fam}</span>
								<span class="text-zinc-400 dark:text-zinc-500 ml-auto text-xs">
									{projection.models.filter((m) => m.family === fam).length}
								</span>
							</li>
						{/each}
					</ul>
				</div>

				<div class="min-h-[220px]">
					<h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Selected</h2>
					{#if hoveredModel}
						<div class="space-y-2">
							<div>
								<div class="font-medium">{hoveredModel.label}</div>
								<div class="text-xs text-zinc-500 dark:text-zinc-400">{hoveredModel.slug}</div>
								<div class="text-xs text-zinc-500 dark:text-zinc-400">
									{hoveredModel.family_label}
									{#if hoveredModel.coverage < 1}
										· coverage {Math.round(hoveredModel.coverage * 100)}%
									{/if}
								</div>
							</div>
							{#if hoveredModel.sample_prompt}
								<div class="text-xs text-zinc-500 dark:text-zinc-400 italic border-l-2 border-zinc-200 dark:border-zinc-800 pl-2 leading-snug">
									{hoveredModel.sample_prompt}
								</div>
								<div class="text-xs text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap max-h-48 overflow-y-auto">
									{hoveredModel.sample_response}
								</div>
							{/if}
						</div>
					{:else}
						<div class="text-xs text-zinc-400 dark:text-zinc-500">
							Hover a point for model info and a sample response.
						</div>
					{/if}
				</div>
			</aside>
		</div>

		<footer class="mt-8 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
			<div>{projection.models.length} models · {projection.n_prompts_used} prompts · {projection.concat_dim.toLocaleString()}-dim fingerprints · UMAP (n_neighbors=5, min_dist=0.3)</div>
			<div>Generated {new Date(projection.generated_at).toISOString().slice(0, 10)}. <a href="https://github.com/padolsey/llmgarden" class="underline hover:text-zinc-700 dark:hover:text-zinc-200">source</a></div>
		</footer>
	{/if}
</main>
