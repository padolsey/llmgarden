/**
 * OpenAI text-embedding-3-small (1536d). Raw fetch, matching the pattern used in
 * nope-net/api/lib/resources/VectorSearch.ts.
 */

const API_URL = 'https://api.openai.com/v1/embeddings';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbedOptions {
	input: string;
	apiKey?: string;
	signal?: AbortSignal;
}

export class OpenAIEmbedError extends Error {
	constructor(message: string, public readonly status: number | null) {
		super(message);
		this.name = 'OpenAIEmbedError';
	}
}

export async function embed(opts: EmbedOptions): Promise<number[]> {
	const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error('OPENAI_API_KEY not set');

	// text-embedding-3-small has an 8191-token input limit. Naive char cap at ~24000
	// (~6000 tokens) is plenty for 600-token model outputs and avoids tokenizer dep.
	const input = opts.input.length > 24000 ? opts.input.slice(0, 24000) : opts.input;

	const res = await fetch(API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: EMBEDDING_MODEL,
			input,
			dimensions: EMBEDDING_DIMENSIONS
		}),
		signal: opts.signal
	});

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new OpenAIEmbedError(`OpenAI embed ${res.status}: ${text.slice(0, 300)}`, res.status);
	}

	const data = (await res.json()) as { data: { embedding: number[] }[] };
	const vec = data.data?.[0]?.embedding;
	if (!vec || vec.length !== EMBEDDING_DIMENSIONS) {
		throw new OpenAIEmbedError(`Unexpected embedding shape: len=${vec?.length}`, null);
	}
	return vec;
}
