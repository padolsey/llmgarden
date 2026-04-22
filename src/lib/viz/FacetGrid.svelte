<script lang="ts">
	import { FAMILY_COLORS, colorFor } from './palette';

	interface ProjCoord { slug: string; x: number; y: number }
	interface PromptProjection {
		prompt_id: string;
		mean_distance: number;
		coords: ProjCoord[];
	}
	interface Prompt { id: string; category: string; text: string }
	interface Model { slug: string; family: string; label: string }

	let {
		per_prompt,
		prompts,
		models,
		activeFamilies,
		onHover
	}: {
		per_prompt: PromptProjection[];
		prompts: Prompt[];
		models: Model[];
		activeFamilies: Set<string>;
		onHover?: (slug: string | null) => void;
	} = $props();

	const familyFor = $derived(new Map(models.map((m) => [m.slug, m.family])));

	// Default selection: 3 most-discriminating + 3 least-discriminating prompts
	const sortedByDist = $derived([...per_prompt].sort((a, b) => b.mean_distance - a.mean_distance));
	const defaultSelection = $derived([
		...sortedByDist.slice(0, 3).map((p) => p.prompt_id),
		...sortedByDist.slice(-3).reverse().map((p) => p.prompt_id)
	]);

	let selected = $state<string[]>([]);
	// Initialise once when data lands.
	$effect(() => {
		if (selected.length === 0 && defaultSelection.length > 0) {
			selected = defaultSelection;
		}
	});

	function togglePrompt(pid: string) {
		if (selected.includes(pid)) {
			selected = selected.filter((p) => p !== pid);
		} else if (selected.length < 9) {
			selected = [...selected, pid];
		}
	}

	function showMostDiscriminating() {
		selected = sortedByDist.slice(0, 9).map((p) => p.prompt_id);
	}
	function showLeastDiscriminating() {
		selected = sortedByDist.slice(-9).reverse().map((p) => p.prompt_id);
	}
	function showMixed() {
		selected = defaultSelection;
	}

	// Grid layout: square-ish based on selection count
	const gridCols = $derived(Math.min(3, Math.ceil(Math.sqrt(selected.length))));

	const FACET = 140;
	const PAD = 0.1;
	function sx(x: number) { return ((x + 1 + PAD) / (2 + 2 * PAD)) * FACET; }
	function sy(y: number) { return ((1 + PAD - y) / (2 + 2 * PAD)) * FACET; }

	const promptText = $derived(new Map(prompts.map((p) => [p.id, p.text])));
	const promptCategory = $derived(new Map(prompts.map((p) => [p.id, p.category])));

	function isActive(family: string): boolean {
		return activeFamilies.size === 0 || activeFamilies.has(family);
	}
</script>

<section class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-6">
	<div class="flex items-center justify-between mb-3">
		<div>
			<h2 class="text-sm font-semibold">Per-prompt map — watch cluster structure shift</h2>
			<p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
				Each tile re-projects all models by their response to one prompt only.
				<em>Factual</em> prompts collapse everyone; <em>opinion</em> and <em>edge</em> prompts pull them apart.
			</p>
		</div>
		<div class="flex items-center gap-1 text-xs">
			<button type="button" onclick={showMostDiscriminating} class="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
				Most discriminating
			</button>
			<button type="button" onclick={showLeastDiscriminating} class="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
				Most collapsed
			</button>
			<button type="button" onclick={showMixed} class="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
				Mixed
			</button>
		</div>
	</div>

	<div class="grid gap-3" style="grid-template-columns: repeat({gridCols}, minmax(0, 1fr))">
		{#each selected as pid}
			{@const pp = per_prompt.find((p) => p.prompt_id === pid)}
			{#if pp}
				{@const text = promptText.get(pid) ?? ''}
				{@const cat = promptCategory.get(pid) ?? ''}
				<div class="relative rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 min-w-0">
					<div class="flex items-baseline justify-between gap-2 mb-1">
						<div class="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">{pid}</div>
						<div class="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
							d={pp.mean_distance.toFixed(3)}
						</div>
					</div>
					<div class="text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2 h-7 mb-1 italic">
						{text}
					</div>
					<svg viewBox="0 0 {FACET} {FACET}" class="w-full aspect-square">
						<rect x="0" y="0" width={FACET} height={FACET} class="fill-white dark:fill-zinc-900" />
						{#each pp.coords as c}
							{@const fam = familyFor.get(c.slug) ?? 'unknown'}
							{@const dim = !isActive(fam)}
							<circle
								cx={sx(c.x)}
								cy={sy(c.y)}
								r="2.2"
								fill={colorFor(fam)}
								opacity={dim ? 0.1 : 0.85}
								role="img"
								aria-label={c.slug}
								onmouseenter={() => onHover?.(c.slug)}
								onmouseleave={() => onHover?.(null)}
								style="cursor: pointer"
							/>
						{/each}
					</svg>
					<div class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">{cat}</div>
				</div>
			{/if}
		{/each}
	</div>

	<!-- Prompt picker -->
	<details class="mt-3 text-xs">
		<summary class="cursor-pointer text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
			Pick specific prompts ({selected.length}/9 selected; ranked by discrimination) ▾
		</summary>
		<div class="mt-2 max-h-64 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
			{#each sortedByDist as pp}
				{@const chosen = selected.includes(pp.prompt_id)}
				<label class="flex items-start gap-1.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 px-1 py-0.5 rounded">
					<input
						type="checkbox"
						checked={chosen}
						onchange={() => togglePrompt(pp.prompt_id)}
						class="mt-1 accent-emerald-500"
					/>
					<span class="flex-1 min-w-0">
						<span class="text-zinc-700 dark:text-zinc-300 font-mono">{pp.prompt_id}</span>
						<span class="text-zinc-400 dark:text-zinc-500 tabular-nums ml-1.5">d={pp.mean_distance.toFixed(3)}</span>
						<span class="text-zinc-500 dark:text-zinc-400 block text-[11px] italic truncate">
							{promptText.get(pp.prompt_id)}
						</span>
					</span>
				</label>
			{/each}
		</div>
	</details>
</section>
