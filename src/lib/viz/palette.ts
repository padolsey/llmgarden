/**
 * Provider-family → color palette. Keyed by family slug from models.ts.
 * Colors chosen to be distinguishable on both light and dark backgrounds.
 */

export const FAMILY_COLORS: Record<string, string> = {
	anthropic: '#d97757',   // warm orange (Claude)
	openai: '#10a37f',      // OpenAI green
	google: '#4285f4',      // Google blue
	meta: '#1877f2',        // Meta blue
	mistral: '#ff7000',     // Mistral orange-red
	deepseek: '#7c3aed',    // purple
	qwen: '#615ced',        // Alibaba indigo
	cohere: '#f472b6',      // Cohere pink
	xai: '#000000',         // xAI black (gets a ring in dark mode)
	nous: '#14b8a6',        // teal
	amazon: '#ff9900',      // AWS orange
	microsoft: '#00a4ef',   // MS blue
	moonshot: '#eab308',    // Kimi yellow
	zai: '#dc2626'          // GLM red
};

export function colorFor(family: string): string {
	return FAMILY_COLORS[family] ?? '#71717a';
}
