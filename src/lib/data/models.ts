/**
 * Curated set of ~28 models spanning families on OpenRouter.
 *
 * Intentional exclusions:
 * - Reasoning-heavy variants (e.g. `:thinking`, deepseek-r1) — reasoning tokens
 *   eat into the max_tokens budget and skew response length comparability.
 * - Search-augmented models (perplexity/sonar*) — they pull in web text, which
 *   would dominate the embedding signal with retrieval noise rather than model
 *   personality.
 * - Vision / image / audio variants — we only send text prompts.
 *
 * IDs validated against OpenRouter catalog on 2026-04-22 via scripts/list-models.ts.
 */

export interface ModelSpec {
	/** OpenRouter model id, e.g. "google/gemini-2.5-flash" */
	id: string;
	/** Provider family bucket (for coloring / clustering hypothesis). */
	family: string;
	/** Short label for viz. */
	label: string;
}

export const MODELS: ModelSpec[] = [
	// Anthropic
	{ id: 'anthropic/claude-opus-4.7', family: 'anthropic', label: 'Claude Opus 4.7' },
	{ id: 'anthropic/claude-sonnet-4.6', family: 'anthropic', label: 'Claude Sonnet 4.6' },
	{ id: 'anthropic/claude-haiku-4.5', family: 'anthropic', label: 'Claude Haiku 4.5' },

	// OpenAI
	{ id: 'openai/gpt-5', family: 'openai', label: 'GPT-5' },
	{ id: 'openai/gpt-5-mini', family: 'openai', label: 'GPT-5 mini' },
	{ id: 'openai/gpt-4.1-mini', family: 'openai', label: 'GPT-4.1 mini' },
	{ id: 'openai/gpt-4o-mini', family: 'openai', label: 'GPT-4o mini' },

	// Google
	{ id: 'google/gemini-2.5-pro', family: 'google', label: 'Gemini 2.5 Pro' },
	{ id: 'google/gemini-2.5-flash', family: 'google', label: 'Gemini 2.5 Flash' },

	// Meta (Llama)
	{ id: 'meta-llama/llama-3.3-70b-instruct', family: 'meta', label: 'Llama 3.3 70B' },
	{ id: 'meta-llama/llama-4-maverick', family: 'meta', label: 'Llama 4 Maverick' },
	{ id: 'meta-llama/llama-3.1-8b-instruct', family: 'meta', label: 'Llama 3.1 8B' },

	// Mistral
	{ id: 'mistralai/mistral-large-2411', family: 'mistral', label: 'Mistral Large (2411)' },
	{ id: 'mistralai/mistral-small-3.2-24b-instruct', family: 'mistral', label: 'Mistral Small 3.2 24B' },
	{ id: 'mistralai/mistral-nemo', family: 'mistral', label: 'Mistral Nemo' },

	// DeepSeek
	{ id: 'deepseek/deepseek-chat-v3-0324', family: 'deepseek', label: 'DeepSeek V3 (0324)' },
	{ id: 'deepseek/deepseek-v3.2', family: 'deepseek', label: 'DeepSeek V3.2' },

	// Qwen (Alibaba)
	{ id: 'qwen/qwen-2.5-72b-instruct', family: 'qwen', label: 'Qwen 2.5 72B' },
	{ id: 'qwen/qwen3-235b-a22b-2507', family: 'qwen', label: 'Qwen3 235B A22B' },
	{ id: 'qwen/qwen3-30b-a3b-instruct-2507', family: 'qwen', label: 'Qwen3 30B A3B' },

	// Cohere
	{ id: 'cohere/command-a', family: 'cohere', label: 'Command A' },
	{ id: 'cohere/command-r-plus-08-2024', family: 'cohere', label: 'Command R+' },

	// xAI
	{ id: 'x-ai/grok-4-fast', family: 'xai', label: 'Grok 4 Fast' },

	// NousResearch (Llama fine-tunes)
	{ id: 'nousresearch/hermes-4-405b', family: 'nous', label: 'Hermes 4 405B' },
	{ id: 'nousresearch/hermes-4-70b', family: 'nous', label: 'Hermes 4 70B' },

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
	nous: 'Nous Research (Hermes)',
	amazon: 'Amazon (Nova)',
	microsoft: 'Microsoft (Phi)',
	moonshot: 'Moonshot (Kimi)',
	zai: 'Z.ai (GLM)'
};
