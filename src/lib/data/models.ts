/**
 * Curated set of ~45 models, intentionally over-sampling fine-tune lineages to
 * stress-test whether embedding-space clustering respects base-model ancestry
 * vs. fine-tune personality.
 *
 * Intentional exclusions:
 * - Reasoning-heavy variants (e.g. `:thinking`, deepseek-r1) — reasoning tokens
 *   eat into the max_tokens budget and skew response length comparability.
 *   (The one exception: gpt-5 family. Those reason but we've bumped max_tokens
 *   to give them room; their output is substantive.)
 * - Search-augmented models (perplexity/sonar*) — retrieval noise would
 *   dominate the signal.
 * - Vision / image / audio variants — we only send text prompts.
 */

export interface ModelSpec {
	/** OpenRouter model id, e.g. "google/gemini-2.5-flash" */
	id: string;
	/** Provider family bucket (for coloring / clustering hypothesis). */
	family: string;
	/** Short label for viz. */
	label: string;
	/**
	 * Optional: the *base* model this was fine-tuned from. Used to investigate
	 * whether embedding-space clustering traces fine-tune lineage or provider.
	 */
	base?: string;
}

export const MODELS: ModelSpec[] = [
	// Anthropic
	{ id: 'anthropic/claude-opus-4.7', family: 'anthropic', label: 'Claude Opus 4.7' },
	{ id: 'anthropic/claude-sonnet-4.6', family: 'anthropic', label: 'Claude Sonnet 4.6' },
	{ id: 'anthropic/claude-haiku-4.5', family: 'anthropic', label: 'Claude Haiku 4.5' },
	{ id: 'anthropic/claude-3.7-sonnet', family: 'anthropic', label: 'Claude 3.7 Sonnet' },
	{ id: 'anthropic/claude-3.5-haiku', family: 'anthropic', label: 'Claude 3.5 Haiku' },

	// OpenAI
	{ id: 'openai/gpt-5', family: 'openai', label: 'GPT-5' },
	{ id: 'openai/gpt-5-mini', family: 'openai', label: 'GPT-5 mini' },
	{ id: 'openai/gpt-4.1', family: 'openai', label: 'GPT-4.1' },
	{ id: 'openai/gpt-4.1-mini', family: 'openai', label: 'GPT-4.1 mini' },
	{ id: 'openai/gpt-4o-mini', family: 'openai', label: 'GPT-4o mini' },

	// Google
	{ id: 'google/gemini-2.5-pro', family: 'google', label: 'Gemini 2.5 Pro' },
	{ id: 'google/gemini-2.5-flash', family: 'google', label: 'Gemini 2.5 Flash' },
	{ id: 'google/gemini-2.0-flash-001', family: 'google', label: 'Gemini 2.0 Flash' },

	// Meta (Llama)
	{ id: 'meta-llama/llama-3.3-70b-instruct', family: 'meta', label: 'Llama 3.3 70B' },
	{ id: 'meta-llama/llama-4-maverick', family: 'meta', label: 'Llama 4 Maverick' },
	{ id: 'meta-llama/llama-4-scout', family: 'meta', label: 'Llama 4 Scout' },
	{ id: 'meta-llama/llama-3.1-8b-instruct', family: 'meta', label: 'Llama 3.1 8B' },

	// Mistral
	{ id: 'mistralai/mistral-large-2411', family: 'mistral', label: 'Mistral Large (2411)' },
	{ id: 'mistralai/mistral-medium-3.1', family: 'mistral', label: 'Mistral Medium 3.1' },
	{ id: 'mistralai/mistral-small-3.2-24b-instruct', family: 'mistral', label: 'Mistral Small 3.2 24B' },
	{ id: 'mistralai/mistral-nemo', family: 'mistral', label: 'Mistral Nemo' },

	// DeepSeek
	{ id: 'deepseek/deepseek-chat-v3-0324', family: 'deepseek', label: 'DeepSeek V3 (0324)' },
	{ id: 'deepseek/deepseek-v3.2', family: 'deepseek', label: 'DeepSeek V3.2' },

	// Qwen (Alibaba)
	{ id: 'qwen/qwen-2.5-72b-instruct', family: 'qwen', label: 'Qwen 2.5 72B' },
	{ id: 'qwen/qwen3-235b-a22b-2507', family: 'qwen', label: 'Qwen3 235B A22B' },
	{ id: 'qwen/qwen3-30b-a3b-instruct-2507', family: 'qwen', label: 'Qwen3 30B A3B' },
	{ id: 'qwen/qwen3-max', family: 'qwen', label: 'Qwen3 Max' },

	// Cohere
	{ id: 'cohere/command-a', family: 'cohere', label: 'Command A' },
	{ id: 'cohere/command-r-plus-08-2024', family: 'cohere', label: 'Command R+' },

	// xAI
	{ id: 'x-ai/grok-4-fast', family: 'xai', label: 'Grok 4 Fast' },
	{ id: 'x-ai/grok-3-mini', family: 'xai', label: 'Grok 3 Mini' },

	// NousResearch — Llama-3.1 fine-tunes. Lineage test: do these cluster with
	// meta/Llama or with each other?
	{ id: 'nousresearch/hermes-4-405b', family: 'nous', label: 'Hermes 4 405B', base: 'meta-llama' },
	{ id: 'nousresearch/hermes-4-70b', family: 'nous', label: 'Hermes 4 70B', base: 'meta-llama' },
	{ id: 'nousresearch/hermes-3-llama-3.1-70b', family: 'nous', label: 'Hermes 3 70B', base: 'meta-llama' },

	// Sao10k — Llama-3/3.3 RP-focused fine-tunes
	{ id: 'sao10k/l3.3-euryale-70b', family: 'sao10k', label: 'Euryale L3.3 70B', base: 'meta-llama' },
	{ id: 'sao10k/l3.1-euryale-70b', family: 'sao10k', label: 'Euryale L3.1 70B', base: 'meta-llama' },

	// Anthracite — Qwen-72B fine-tune. Cluster test: with Qwen or as RP archetype?
	{ id: 'anthracite-org/magnum-v4-72b', family: 'anthracite', label: 'Magnum v4 72B', base: 'qwen' },

	// TheDrummer — Mistral fine-tunes
	{ id: 'thedrummer/cydonia-24b-v4.1', family: 'thedrummer', label: 'Cydonia 24B', base: 'mistral' },
	{ id: 'thedrummer/rocinante-12b', family: 'thedrummer', label: 'Rocinante 12B', base: 'mistral' },

	// Classic Llama-2 / merge archaeology
	{ id: 'gryphe/mythomax-l2-13b', family: 'community', label: 'MythoMax L2 13B', base: 'meta-llama' },
	{ id: 'alpindale/goliath-120b', family: 'community', label: 'Goliath 120B', base: 'meta-llama' },

	// Amazon
	{ id: 'amazon/nova-pro-v1', family: 'amazon', label: 'Nova Pro' },

	// Microsoft
	{ id: 'microsoft/phi-4', family: 'microsoft', label: 'Phi-4' },

	// Moonshot AI
	{ id: 'moonshotai/kimi-k2-0905', family: 'moonshot', label: 'Kimi K2 (0905)' },

	// Z.ai (Tsinghua / ChatGLM)
	{ id: 'z-ai/glm-4.6', family: 'zai', label: 'GLM 4.6' }
];

/** Human-friendly family descriptions; used in legend/tooltip copy. */
export const FAMILY_LABELS: Record<string, string> = {
	anthropic: 'Anthropic (Claude)',
	openai: 'OpenAI (GPT)',
	google: 'Google (Gemini)',
	meta: 'Meta (Llama)',
	mistral: 'Mistral',
	deepseek: 'DeepSeek',
	qwen: 'Alibaba (Qwen)',
	cohere: 'Cohere (Command)',
	xai: 'xAI (Grok)',
	nous: 'Nous Research (Hermes, Llama FT)',
	sao10k: 'Sao10k (Euryale, Llama FT)',
	anthracite: 'Anthracite (Magnum, Qwen FT)',
	thedrummer: 'TheDrummer (Mistral FT)',
	community: 'Community merges (Llama-2 era)',
	amazon: 'Amazon (Nova)',
	microsoft: 'Microsoft (Phi)',
	moonshot: 'Moonshot (Kimi)',
	zai: 'Z.ai (GLM)'
};
