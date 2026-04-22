/**
 * OpenRouter one-shot chat completion.
 *
 * Simplified from nope-net/api/lib/providers/OpenRouterProvider.ts — no streaming,
 * but we keep the reasoning-model max_tokens bump. Reasoning models emit internal
 * reasoning that counts against max_tokens, so without the bump they hit the cap
 * before producing any visible content and we get empty responses.
 */

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const REASONING_MODEL_PATTERNS: RegExp[] = [
	/\bgpt-5/,
	/\bo[1-9](-|$)/,
	/\bdeepseek-r1/,
	/\bqwq\b/,
	/\bqwen.*thinking/,
	/:thinking\b/,
	/\bgpt-oss-safeguard/
];

function isReasoningModel(modelId: string): boolean {
	const name = modelId.replace(/^openrouter:/, '');
	return REASONING_MODEL_PATTERNS.some((re) => re.test(name));
}

export interface GenerateOptions {
	model: string;
	prompt: string;
	temperature?: number;
	maxTokens?: number;
	apiKey?: string;
	signal?: AbortSignal;
}

export interface GenerateResult {
	text: string;
	usage?: Record<string, unknown>;
	raw_model: string;
}

export class OpenRouterError extends Error {
	constructor(
		message: string,
		public readonly status: number | null,
		public readonly body: string | null
	) {
		super(message);
		this.name = 'OpenRouterError';
	}
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
	const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

	const requestedMax = opts.maxTokens ?? 600;
	const effectiveMax = isReasoningModel(opts.model) ? Math.max(requestedMax * 8, 2400) : requestedMax;

	const body = {
		model: opts.model.replace(/^openrouter:/, ''),
		messages: [{ role: 'user', content: opts.prompt }],
		temperature: opts.temperature ?? 0.7,
		max_tokens: effectiveMax,
		stream: false
	};

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://github.com/padolsey/llmgarden',
			'X-Title': 'llmgarden'
		},
		body: JSON.stringify(body),
		signal: opts.signal
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new OpenRouterError(
			`OpenRouter ${res.status}: ${text.slice(0, 300)}`,
			res.status,
			text
		);
	}

	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
		usage?: Record<string, unknown>;
		model?: string;
	};

	const text = data.choices?.[0]?.message?.content ?? '';
	if (!text) {
		throw new OpenRouterError('Empty response from OpenRouter', null, JSON.stringify(data).slice(0, 500));
	}

	return {
		text,
		usage: data.usage,
		raw_model: data.model ?? body.model
	};
}

export function isRetryable(err: unknown): boolean {
	if (err instanceof OpenRouterError) {
		if (err.status === null) return true;
		if (err.status === 429) return true;
		if (err.status >= 500 && err.status < 600) return true;
		return false;
	}
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		return (
			msg.includes('timeout') ||
			msg.includes('econn') ||
			msg.includes('fetch failed') ||
			msg.includes('network')
		);
	}
	return false;
}
