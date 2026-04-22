<script lang="ts">
	import { FAMILY_COLORS, colorFor } from '$lib/viz/palette';
	import SampleCloud from '$lib/viz/SampleCloud.svelte';
	import FacetGrid from '$lib/viz/FacetGrid.svelte';
	import IsolationBar from '$lib/viz/IsolationBar.svelte';
	import FtAxisRibbon from '$lib/viz/FtAxisRibbon.svelte';

	let { data } = $props();
	const projection = $derived(data.data);

	// ─── Main (model-level) view state ──────────────────────────────────────
	let hovered = $state<string | null>(null);
	let axisAnchor = $state<string | null>(null); // first model for latent-axis probe
	let axisTarget = $state<string | null>(null); // second model
	let activeFamilies = $state<Set<string>>(new Set());
	let showKnn = $state(true);
	let showTrajectories = $state(true);
	let showVoiceSiblings = $state(false);
	let showLineagePaths = $state(false);
	let showSpreadArrows = $state(false);

	const hoveredModel = $derived(
		hovered ? projection?.models.find((m) => m.slug === hovered) ?? null : null
	);

	// ─── SVG view geometry ──────────────────────────────────────────────────
	const VIEW = 360;
	const PAD = 0.15;
	function svgX(x: number) { return ((x + 1 + PAD) / (2 + 2 * PAD)) * VIEW; }
	function svgY(y: number) { return ((1 + PAD - y) / (2 + 2 * PAD)) * VIEW; }

	const families = $derived(
		projection
			? [...new Set(projection.models.map((m) => m.family))].sort()
			: []
	);

	function isFamilyActive(fam: string): boolean {
		return activeFamilies.size === 0 || activeFamilies.has(fam);
	}

	function toggleFamily(fam: string, additive: boolean) {
		if (additive) {
			const next = new Set(activeFamilies);
			if (next.has(fam)) next.delete(fam);
			else next.add(fam);
			activeFamilies = next;
		} else if (activeFamilies.size === 1 && activeFamilies.has(fam)) {
			activeFamilies = new Set();
		} else {
			activeFamilies = new Set([fam]);
		}
	}

	function selectForAxis(slug: string) {
		if (!axisAnchor) axisAnchor = slug;
		else if (!axisTarget && slug !== axisAnchor) axisTarget = slug;
		else {
			// reset
			axisAnchor = slug;
			axisTarget = null;
		}
	}

	function clearAxis() {
		axisAnchor = null;
		axisTarget = null;
	}

	// Temperature trajectories: per model, sorted (temp, x, y) points to draw.
	const trajectories = $derived(() => {
		if (!projection) return [] as { slug: string; family: string; points: { x: number; y: number; temperature: number }[] }[];
		const byModel = new Map<string, { slug: string; family: string; points: { x: number; y: number; temperature: number }[] }>();
		for (const tc of projection.model_temps) {
			if (!byModel.has(tc.slug)) byModel.set(tc.slug, { slug: tc.slug, family: tc.family, points: [] });
			byModel.get(tc.slug)!.points.push({ x: tc.x_umap, y: tc.y_umap, temperature: tc.temperature });
		}
		for (const v of byModel.values()) v.points.sort((a, b) => a.temperature - b.temperature);
		return [...byModel.values()].filter((v) => v.points.length >= 2);
	});

	// 1D latent-axis projection: for each model, dot product of (model − A) with (B − A) / |B − A|.
	const axisProjection = $derived(() => {
		if (!projection || !axisAnchor || !axisTarget) return null;
		const iA = projection.models.findIndex((m) => m.slug === axisAnchor);
		const iB = projection.models.findIndex((m) => m.slug === axisTarget);
		if (iA < 0 || iB < 0) return null;
		// Position of each model along the A↔B axis. 0 = at A, 1 = at B.
		// Positions derived from the pairwise cosine matrix — more stable than 2D.
		// For each model M: simCos(M,B) - simCos(M,A), then normalize to 0..1 with B=1 A=0.
		const simMA = projection.pairwise[iA];
		const simMB = projection.pairwise[iB];
		const raw = projection.models.map((_, i) => simMB[i] - simMA[i]);
		const at0 = raw[iA];
		const at1 = raw[iB];
		const span = at1 - at0 || 1;
		return projection.models.map((m, i) => ({
			slug: m.slug,
			family: m.family,
			label: m.label,
			position: (raw[i] - at0) / span
		}));
	});

	// ─── Sample cloud hover ──────────────────────────────────────────────────
	let cloudHover = $state<{ slug: string; family: string; promptId: string; temp: number } | null>(null);
	function onCloudHover(slug: string | null, family: string | null, promptId: string | null, temp: number | null) {
		cloudHover = slug && family && promptId && temp !== null
			? { slug, family, promptId, temp }
			: null;
	}
	const hoveredPromptText = $derived(
		cloudHover ? projection?.prompts.find((p) => p.id === cloudHover!.promptId)?.text ?? '' : ''
	);

	// Top-k nearest neighbors for the currently hovered model (by cosine on the
	// full fingerprint — more stable than 2D distance).
	const nearestNeighbors = $derived(() => {
		if (!projection || !hovered) return [];
		const idx = projection.models.findIndex((m) => m.slug === hovered);
		if (idx < 0) return [];
		const sims = projection.pairwise[idx];
		return projection.models
			.map((m, i) => ({ model: m, sim: sims[i] }))
			.filter((x) => x.model.slug !== hovered)
			.sort((a, b) => b.sim - a.sim)
			.slice(0, 5);
	});

	interface FamilyCohesion {
		crossMean: number;
		rows: { family: string; n: number; intra_mean: number; delta: number }[];
	}

	// Intra-family vs cross-family similarity. Reveals which families have tight
	// "voices" vs loose ones.
	const familyCohesion = $derived((): FamilyCohesion | null => {
		if (!projection) return null;
		const byFamily = new Map<string, number[]>();
		projection.models.forEach((m, i) => {
			if (!byFamily.has(m.family)) byFamily.set(m.family, []);
			byFamily.get(m.family)!.push(i);
		});

		let crossSum = 0, crossN = 0;
		for (let i = 0; i < projection.models.length; i++) {
			for (let j = i + 1; j < projection.models.length; j++) {
				if (projection.models[i].family === projection.models[j].family) continue;
				crossSum += projection.pairwise[i][j];
				crossN++;
			}
		}
		const crossMean = crossN > 0 ? crossSum / crossN : 0;

		const rows: FamilyCohesion['rows'] = [];
		for (const [family, idxs] of byFamily.entries()) {
			if (idxs.length < 2) continue;
			let s = 0, n = 0;
			for (let a = 0; a < idxs.length; a++) {
				for (let b = a + 1; b < idxs.length; b++) {
					s += projection.pairwise[idxs[a]][idxs[b]];
					n++;
				}
			}
			const intraMean = s / n;
			rows.push({ family, n: idxs.length, intra_mean: intraMean, delta: intraMean - crossMean });
		}
		rows.sort((a, b) => b.delta - a.delta);
		return { crossMean, rows };
	});
</script>

<main class="px-5 py-6 max-w-7xl mx-auto">
	<section class="mb-6">
		<h1 class="text-xl font-semibold mb-1">Embedding-space map of large language models</h1>
		<p class="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl leading-relaxed">
			{projection?.models.length ?? '…'} models answered {projection?.n_prompts ?? '…'} prompts
			{#if projection && projection.n_samples_total > projection.models.length * projection.n_prompts}
				at multiple temperatures
			{/if}. Each response was embedded with <code class="text-xs">text-embedding-3-small</code>.
			The left map is MDS on model-level cosine distance — each point is one model's full
			fingerprint. The right map is UMAP on every individual response, aligned to the same frame.
			Click a model to pick a <em>latent-axis anchor</em>; click another to project every
			model along that axis.
		</p>
	</section>

	{#if !projection}
		<div class="rounded border border-zinc-200 dark:border-zinc-800 p-6 text-sm text-zinc-500">
			No projection yet. Run <code>pnpm harness</code> then <code>pnpm project</code>.
		</div>
	{:else}
		<!-- Legend / filter bar -->
		<div class="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
			<span class="text-zinc-400 dark:text-zinc-500 mr-2">families:</span>
			{#each families as fam}
				{@const active = activeFamilies.size === 0 || activeFamilies.has(fam)}
				<button
					type="button"
					onclick={(e) => toggleFamily(fam, e.shiftKey || e.metaKey || e.ctrlKey)}
					class="px-2 py-0.5 rounded border transition-all {active ? 'border-zinc-400 dark:border-zinc-600' : 'border-transparent opacity-30'}"
					title={projection.family_labels[fam] ?? fam}
				>
					<span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style="background: {FAMILY_COLORS[fam] ?? '#71717a'}"></span>
					<span class="align-middle">{projection.family_labels[fam] ?? fam}</span>
				</button>
			{/each}
			{#if activeFamilies.size > 0}
				<button type="button" onclick={() => (activeFamilies = new Set())} class="ml-2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 underline">
					clear
				</button>
			{/if}
			<span class="flex-1"></span>
			<label class="flex items-center gap-1.5 cursor-pointer text-zinc-500 dark:text-zinc-400">
				<input type="checkbox" bind:checked={showKnn} class="accent-current" />
				<span>kNN skeleton</span>
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer text-zinc-500 dark:text-zinc-400">
				<input type="checkbox" bind:checked={showTrajectories} class="accent-current" />
				<span>temperature trajectories</span>
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer text-zinc-500 dark:text-zinc-400">
				<input type="checkbox" bind:checked={showVoiceSiblings} class="accent-current" />
				<span>voice siblings</span>
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer text-zinc-500 dark:text-zinc-400">
				<input type="checkbox" bind:checked={showLineagePaths} class="accent-current" />
				<span>lineage arrows</span>
			</label>
			<label class="flex items-center gap-1.5 cursor-pointer text-zinc-500 dark:text-zinc-400">
				<input type="checkbox" bind:checked={showSpreadArrows} class="accent-current" />
				<span>spread directions</span>
			</label>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<!-- Left: MDS scatter of model fingerprints -->
			<div class="relative">
				<div class="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Model fingerprints (MDS on cosine)</div>
				<svg viewBox="0 0 {VIEW} {VIEW}" class="w-full aspect-square border border-zinc-200 dark:border-zinc-800 rounded bg-zinc-50 dark:bg-zinc-950">
					<!-- Subtle grid -->
					{#each [0.25, 0.5, 0.75] as frac}
						<line x1={frac * VIEW} y1="0" x2={frac * VIEW} y2={VIEW} class="stroke-zinc-200 dark:stroke-zinc-900" stroke-width="0.3" />
						<line x1="0" y1={frac * VIEW} x2={VIEW} y2={frac * VIEW} class="stroke-zinc-200 dark:stroke-zinc-900" stroke-width="0.3" />
					{/each}

					<!-- kNN skeleton -->
					{#if showKnn}
						<g class="stroke-zinc-300 dark:stroke-zinc-700" stroke-width="0.4" fill="none" opacity="0.65">
							{#each projection.model_knn_edges as edge}
								{@const A = projection.models.find((m) => m.slug === edge.from)}
								{@const B = projection.models.find((m) => m.slug === edge.to)}
								{#if A && B && isFamilyActive(A.family) && isFamilyActive(B.family)}
									<line
										x1={svgX(A.x_umap)} y1={svgY(A.y_umap)}
										x2={svgX(B.x_umap)} y2={svgY(B.y_umap)}
										stroke-dasharray={A.family === B.family ? 'none' : '2,2'}
									/>
								{/if}
							{/each}
						</g>
					{/if}

					<!-- Temperature trajectories -->
					{#if showTrajectories}
						<g fill="none" stroke-width="0.8" opacity="0.5">
							{#each trajectories() as traj}
								{#if isFamilyActive(traj.family)}
									<polyline
										stroke={colorFor(traj.family)}
										points={traj.points.map((p) => `${svgX(p.x)},${svgY(p.y)}`).join(' ')}
									/>
									{#each traj.points as p}
										<circle cx={svgX(p.x)} cy={svgY(p.y)} r={1 + p.temperature * 0.8} fill={colorFor(traj.family)} opacity="0.35" />
									{/each}
								{/if}
							{/each}
						</g>
					{/if}

					<!-- Voice-sibling cross-family edges -->
					{#if showVoiceSiblings}
						<g stroke-width="0.6" fill="none" class="stroke-amber-500 dark:stroke-amber-400" opacity="0.55">
							{#each projection.model_knn_edges as edge}
								{@const A = projection.models.find((m) => m.slug === edge.from)}
								{@const B = projection.models.find((m) => m.slug === edge.to)}
								{#if A && B && A.family !== B.family && edge.similarity >= 0.93 && isFamilyActive(A.family) && isFamilyActive(B.family)}
									<line x1={svgX(A.x_umap)} y1={svgY(A.y_umap)} x2={svgX(B.x_umap)} y2={svgY(B.y_umap)} />
								{/if}
							{/each}
						</g>
					{/if}

					<!-- Lineage / generational arrows -->
					{#if showLineagePaths}
						<g fill="none" opacity="0.65">
							{#each projection.lineage_paths as lp}
								{@const pts = lp.slugs
									.map((s) => projection.models.find((m) => m.slug === s))
									.filter((m) => m && isFamilyActive(m.family))}
								{#if pts.length >= 2}
									{@const fam = pts[0]!.family}
									{@const color = colorFor(fam)}
									<polyline
										stroke={color}
										stroke-width="0.6"
										stroke-dasharray="3,2"
										points={pts.map((m) => `${svgX(m!.x_umap)},${svgY(m!.y_umap)}`).join(' ')}
									/>
									<!-- Arrowhead at end -->
									{#if pts.length >= 2}
										{@const a = pts[pts.length - 2]!}
										{@const b = pts[pts.length - 1]!}
										{@const ax = svgX(a.x_umap)}
										{@const ay = svgY(a.y_umap)}
										{@const bx = svgX(b.x_umap)}
										{@const by = svgY(b.y_umap)}
										{@const dxn = bx - ax}
										{@const dyn = by - ay}
										{@const len = Math.sqrt(dxn * dxn + dyn * dyn) || 1}
										{@const ux = dxn / len}
										{@const uy = dyn / len}
										<polygon
											fill={color}
											points="{bx},{by} {bx - 4 * ux - 2 * uy},{by - 4 * uy + 2 * ux} {bx - 4 * ux + 2 * uy},{by - 4 * uy - 2 * ux}"
										/>
									{/if}
								{/if}
							{/each}
						</g>
					{/if}

					<!-- Spread direction arrows (temp=1.0 top-PC) -->
					{#if showSpreadArrows}
						<g stroke-width="0.5" fill="none" opacity="0.7">
							{#each projection.models as m}
								{#if isFamilyActive(m.family) && (m.spread_dx !== 0 || m.spread_dy !== 0)}
									{@const cx = svgX(m.x_umap)}
									{@const cy = svgY(m.y_umap)}
									{@const mag = Math.sqrt(m.spread_dx * m.spread_dx + m.spread_dy * m.spread_dy)}
									{@const scale = 80}
									{@const dx = (m.spread_dx / Math.max(mag, 0.0001)) * Math.min(mag * scale, 18)}
									{@const dy = -(m.spread_dy / Math.max(mag, 0.0001)) * Math.min(mag * scale, 18)}
									<line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy} stroke={colorFor(m.family)} />
									<line x1={cx} y1={cy} x2={cx - dx} y2={cy - dy} stroke={colorFor(m.family)} opacity="0.4" />
								{/if}
							{/each}
						</g>
					{/if}

					<!-- Latent-axis line A → B -->
					{#if axisAnchor && axisTarget}
						{@const A = projection.models.find((m) => m.slug === axisAnchor)}
						{@const B = projection.models.find((m) => m.slug === axisTarget)}
						{#if A && B}
							<line
								x1={svgX(A.x_umap)} y1={svgY(A.y_umap)}
								x2={svgX(B.x_umap)} y2={svgY(B.y_umap)}
								class="stroke-amber-500 dark:stroke-amber-400"
								stroke-width="1.5"
								stroke-dasharray="4,3"
							/>
						{/if}
					{/if}

					<!-- Model points + labels -->
					<!-- Volatility halos (rendered first so they sit behind everything else) -->
					{#each projection.models as m (m.slug + '-halo')}
						{@const cx = svgX(m.x_umap)}
						{@const cy = svgY(m.y_umap)}
						{@const dim = !isFamilyActive(m.family)}
						{@const vr = 2 + m.volatility * 120}
						{#if !dim && m.volatility > 0 && vr < 30}
							<circle {cx} {cy} r={vr}
								fill={colorFor(m.family)}
								opacity="0.06"
							/>
						{/if}
					{/each}

					{#each projection.models as m (m.slug)}
						{@const cx = svgX(m.x_umap)}
						{@const cy = svgY(m.y_umap)}
						{@const isHovered = hovered === m.slug}
						{@const isAxis = m.slug === axisAnchor || m.slug === axisTarget}
						{@const dim = !isFamilyActive(m.family)}
						<g
							role="button"
							tabindex="0"
							aria-label={m.label}
							onmouseenter={() => (hovered = m.slug)}
							onmouseleave={() => (hovered = null)}
							onfocus={() => (hovered = m.slug)}
							onblur={() => (hovered = null)}
							onclick={() => selectForAxis(m.slug)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectForAxis(m.slug); } }}
							opacity={dim ? 0.18 : 1}
							style="cursor: pointer"
						>
							<circle {cx} {cy} r={isHovered ? 5 : isAxis ? 4.5 : 3}
								fill={colorFor(m.family)}
								stroke={isAxis ? '#f59e0b' : 'white'}
								stroke-width={isAxis ? 1.5 : 0.8}
								class="dark:stroke-zinc-900"
								style={isAxis ? 'stroke: #f59e0b' : ''}
							/>
							<text
								x={cx + 5}
								y={cy + 2}
								class="fill-zinc-700 dark:fill-zinc-300 pointer-events-none select-none"
								font-size="4"
								style="font-family: ui-sans-serif, system-ui, sans-serif"
							>
								{m.label}
							</text>
						</g>
					{/each}
				</svg>
			</div>

			<!-- Right: WebGL sample cloud + density contours -->
			<div class="relative">
				<div class="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">
					All {projection.n_samples_total.toLocaleString()} individual responses (UMAP + density contours)
				</div>
				<div class="relative aspect-square border border-zinc-200 dark:border-zinc-800 rounded overflow-hidden bg-zinc-50 dark:bg-zinc-950">
					<SampleCloud
						samples={projection.samples}
						activeFamilies={activeFamilies}
						onHover={onCloudHover}
					/>
					{#if cloudHover}
						<div class="absolute top-2 left-2 right-2 text-xs bg-zinc-900/85 text-zinc-200 px-2 py-1.5 rounded pointer-events-none max-w-[calc(100%-1rem)]">
							<div class="font-medium truncate">{cloudHover.slug}</div>
							<div class="text-zinc-400 text-[10px]">
								{cloudHover.promptId} · temp {cloudHover.temp.toFixed(1)}
							</div>
							{#if hoveredPromptText}
								<div class="text-zinc-400 text-[10px] italic mt-0.5 line-clamp-2">
									{hoveredPromptText}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Latent-axis projection (1D) -->
		{#if axisProjection()}
			{@const projData = axisProjection()!}
			{@const A = projection.models.find((m) => m.slug === axisAnchor)!}
			{@const B = projection.models.find((m) => m.slug === axisTarget)!}
			<div class="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
				<div class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-2 uppercase tracking-wide">
					<span>Latent axis: <span style="color: {colorFor(A.family)}">{A.label}</span> → <span style="color: {colorFor(B.family)}">{B.label}</span></span>
					<button type="button" onclick={clearAxis} class="hover:text-zinc-700 dark:hover:text-zinc-200 underline">clear axis</button>
				</div>
				<div class="relative h-24 w-full">
					<div class="absolute inset-x-0 top-1/2 h-px bg-zinc-300 dark:bg-zinc-700"></div>
					<div class="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-zinc-500 dark:text-zinc-400" style="color: {colorFor(A.family)}">
						<span class="inline-block w-1.5 h-1.5 rounded-full mr-1" style="background: {colorFor(A.family)}"></span>
						{A.label}
					</div>
					<div class="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-zinc-500 dark:text-zinc-400 text-right" style="color: {colorFor(B.family)}">
						{B.label}
						<span class="inline-block w-1.5 h-1.5 rounded-full ml-1" style="background: {colorFor(B.family)}"></span>
					</div>
					{#each projData as p}
						{@const leftPct = Math.max(0, Math.min(1, p.position)) * 100}
						<div
							class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
							style="left: {leftPct}%"
						>
							<div class="w-2 h-2 rounded-full" style="background: {colorFor(p.family)}"></div>
							<div class="absolute left-1/2 -translate-x-1/2 top-3 text-[10px] whitespace-nowrap text-zinc-500 dark:text-zinc-400 opacity-0 group-hover:opacity-100 transition">
								{p.label}
							</div>
						</div>
					{/each}
				</div>
				<div class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					Position = (cos(M,B) − cos(M,A)) scaled to [0,1]. Hover a dot for the model.
				</div>
			</div>
		{/if}

		<!-- Selected model detail -->
		{#if hoveredModel}
			<div class="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-4">
				<div>
					<div class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Selected</div>
					<div class="font-medium">{hoveredModel.label}</div>
					<div class="text-xs text-zinc-500 dark:text-zinc-400">{hoveredModel.slug}</div>
					<div class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
						{hoveredModel.family_label}
						{#if hoveredModel.base} · fine-tune of <em>{hoveredModel.base}</em>{/if}
					</div>
					<div class="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
						{hoveredModel.sample_count} samples · coverage {Math.round(hoveredModel.coverage * 100)}% · volatility {hoveredModel.volatility.toFixed(3)}
					</div>
				</div>
				<div>
					<div class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Nearest neighbors (cosine)</div>
					<ul class="text-xs space-y-1">
						{#each nearestNeighbors() as nn}
							<li class="flex items-center gap-2">
								<span class="inline-block w-1.5 h-1.5 rounded-full" style="background: {colorFor(nn.model.family)}"></span>
								<span class="text-zinc-700 dark:text-zinc-300 flex-1 truncate">{nn.model.label}</span>
								<span class="text-zinc-500 dark:text-zinc-400 tabular-nums">{nn.sim.toFixed(3)}</span>
							</li>
						{/each}
					</ul>
				</div>
				{#if hoveredModel.sample_response}
					<div>
						<div class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Sample response</div>
						<div class="text-xs text-zinc-500 dark:text-zinc-400 italic border-l-2 border-zinc-200 dark:border-zinc-800 pl-2 mb-2 leading-snug">
							{hoveredModel.sample_prompt}
						</div>
						<div class="text-xs text-zinc-700 dark:text-zinc-300 leading-snug whitespace-pre-wrap max-h-52 overflow-y-auto">
							{hoveredModel.sample_response}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Family cohesion ladder -->
		{@const cohesion = familyCohesion()}
		{#if cohesion && cohesion.rows.length > 0}
			<div class="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
				<div class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
					Family cohesion — intra-family similarity vs. the {cohesion.crossMean.toFixed(3)} cross-family baseline
				</div>
				<div class="space-y-1 max-w-xl">
					{#each cohesion.rows as row}
						{@const leftPct = Math.max(0, Math.min(1, (row.intra_mean - Math.min(cohesion.crossMean - 0.02, 0.6)) / 0.3)) * 100}
						<div class="flex items-center gap-2 text-xs">
							<span class="inline-block w-2 h-2 rounded-full flex-none" style="background: {colorFor(row.family)}"></span>
							<span class="text-zinc-700 dark:text-zinc-300 w-36 truncate">{projection.family_labels[row.family] ?? row.family}</span>
							<span class="text-zinc-400 dark:text-zinc-500 tabular-nums w-6 text-right">n={row.n}</span>
							<div class="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
								<div class="absolute inset-y-0 left-0" style="width: {leftPct}%; background: {colorFor(row.family)}"></div>
							</div>
							<span class="tabular-nums text-zinc-500 dark:text-zinc-400 w-12 text-right">{row.intra_mean.toFixed(3)}</span>
							<span class="tabular-nums text-zinc-400 dark:text-zinc-500 w-12 text-right" class:text-emerald-500={row.delta > 0} class:text-red-500={row.delta < 0}>
								{row.delta >= 0 ? '+' : ''}{row.delta.toFixed(3)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<FacetGrid
			per_prompt={projection.per_prompt}
			prompts={projection.prompts}
			models={projection.models}
			{activeFamilies}
			onHover={(slug) => (hovered = slug)}
		/>

		<FtAxisRibbon
			models={projection.models}
			{activeFamilies}
			onHover={(slug) => (hovered = slug)}
		/>

		<IsolationBar
			models={projection.models}
			{activeFamilies}
			onHover={(slug) => (hovered = slug)}
		/>

		<footer class="mt-8 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
			<div>
				{projection.models.length} models · {projection.n_prompts} prompts ·
				{projection.n_samples_total.toLocaleString()} total samples ·
				{projection.concat_dim.toLocaleString()}-d fingerprints · MDS (cosine) / UMAP (samples)
			</div>
			<div>
				Generated {new Date(projection.generated_at).toISOString().slice(0, 10)}.
				<a href="https://github.com/padolsey/llmgarden" class="underline hover:text-zinc-700 dark:hover:text-zinc-200">source</a>
			</div>
		</footer>
	{/if}
</main>
