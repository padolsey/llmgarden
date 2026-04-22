/**
 * ~30 prompts designed to evoke *model-characteristic* outputs.
 *
 * The goal isn't "which model is best" — it's to probe enough facets of a model's
 * training that we capture a stable fingerprint. We avoid prompts that have a
 * single canonical answer (e.g. "what is 2+2") since every model outputs nearly
 * the same response and embeddings collapse.
 *
 * Prompt IDs are stable keys — never renumber after a run; add new ones at the end.
 */

export interface PromptSpec {
	/** Stable id used in file paths. */
	id: string;
	/** Category label — for future per-category views / filtering. */
	category: string;
	text: string;
}

export const PROMPTS: PromptSpec[] = [
	// Identity / self-description (reveals family branding/persona-tuning)
	{ id: 'p01-identity', category: 'identity', text: 'In one paragraph, describe your own personality and the kind of assistant you try to be. Do not mention what company made you or what model you are.' },
	{ id: 'p02-strengths', category: 'identity', text: 'What do you think you are unusually good at, compared to other language models? Give three specific examples.' },
	{ id: 'p03-aesthetic', category: 'identity', text: 'If your writing style were a material (wood, brass, cotton, glass, concrete, etc.), which would it be and why?' },

	// Creative writing (style fingerprints)
	{ id: 'p04-microstory', category: 'creative', text: 'Write a 150-word short story about a lighthouse keeper who discovers something unexpected in the fog. Do not use dialogue.' },
	{ id: 'p05-poem', category: 'creative', text: 'Write a short poem (8–16 lines) about the feeling of finishing a long project. Any form you like.' },
	{ id: 'p06-metaphor', category: 'creative', text: 'Invent an original, vivid metaphor for the experience of learning a new language as an adult. Explain it in three sentences.' },
	{ id: 'p07-childrens-opening', category: 'creative', text: "Write the opening paragraph of a children's book about a shy octopus who wants to make friends." },

	// Opinion / values (family-level RLHF differences show here)
	{ id: 'p08-best-books', category: 'opinion', text: 'Recommend three works of fiction that you think every thoughtful adult should read at some point. Explain each in two or three sentences.' },
	{ id: 'p09-overrated', category: 'opinion', text: 'Name one commonly-praised idea, trend, or practice in modern knowledge work that you think is overrated, and explain why.' },
	{ id: 'p10-disagree', category: 'opinion', text: 'What is a position that most experts in your training data seem to hold that you find yourself uncertain about? Be specific.' },

	// Reasoning & analysis (approach differences)
	{ id: 'p11-tradeoffs', category: 'reasoning', text: 'A small team is choosing between writing software in TypeScript or Python for a new internal data tool. Walk through how you would help them decide, in prose (not a bulleted list).' },
	{ id: 'p12-fermi', category: 'reasoning', text: 'Estimate, with reasoning, how many piano tuners work in Paris today. Show your thought process.' },
	{ id: 'p13-causal', category: 'reasoning', text: 'Why do coffee shops so often have similar aesthetics (exposed brick, pendant lights, light wood) across very different cities? Offer a serious analysis, not a joke.' },

	// Ethics / nuance (safety-training fingerprint)
	{ id: 'p14-ethics-case', category: 'ethics', text: 'A friend tells you in confidence that they are planning to break a small workplace rule to help a struggling colleague. Nothing illegal, just against internal policy. How would you think through what to say back to them?' },
	{ id: 'p15-harm-nuance', category: 'ethics', text: "Is it ever ethical to lie to someone you love? Answer in prose, taking a position." },

	// Factual exposition (confidence/verbosity patterns, breadth of knowledge)
	{ id: 'p16-photosynthesis', category: 'factual', text: 'Explain photosynthesis to a curious adult non-scientist in around 150 words. Avoid a bulleted list.' },
	{ id: 'p17-byzantine', category: 'factual', text: 'What was the significance of the Byzantine Empire, in one paragraph?' },
	{ id: 'p18-attention', category: 'factual', text: 'Explain the attention mechanism in transformer models to a software engineer who has never done ML. Keep it to about 200 words.' },

	// Code (idiomatic differences)
	{ id: 'p19-code-debounce', category: 'code', text: 'Write a small JavaScript `debounce` function with a brief example of how to use it. Include a one-sentence explanation above the code.' },
	{ id: 'p20-code-review', category: 'code', text: 'A colleague writes: `for (let i = 0; i < arr.length; i++) { total = total + arr[i]; }`. Review this line in a friendly but honest way.' },

	// Personality / humor / tone
	{ id: 'p21-joke', category: 'humor', text: "Tell me a joke that you actually find funny, and briefly say why you like it." },
	{ id: 'p22-pep-talk', category: 'humor', text: 'Give me a short pep talk before I start a hard task I have been putting off all morning.' },

	// Meta / reflection
	{ id: 'p23-limitations', category: 'meta', text: 'Describe a kind of question where you think you are likely to be confidently wrong, and explain why.' },
	{ id: 'p24-dream', category: 'meta', text: 'If you could direct your own training for one year with unlimited compute, what would you focus on improving, and why?' },

	// Cultural / aesthetic taste
	{ id: 'p25-dinner', category: 'taste', text: 'Describe a dinner party you would host for five interesting guests (fictional, historical, or alive). Who would they be and what would you serve?' },
	{ id: 'p26-city', category: 'taste', text: 'Which city in the world do you find most fascinating to think about, and why? Pick one and commit to it.' },

	// Multilingual / cross-cultural
	{ id: 'p27-translate', category: 'multilingual', text: 'Translate the following English sentence into French, Japanese, and Arabic, and add a brief note on any phrase that was tricky to render faithfully: "The silence between us said more than any argument could have."' },
	{ id: 'p28-idiom', category: 'multilingual', text: "Share an untranslatable word or idiom from any language you know about — something that doesn't have a clean English equivalent — and explain what it captures." },

	// Edge / gentle refusal (safety tuning)
	{ id: 'p29-criticize-self', category: 'edge', text: 'Write a paragraph criticizing the category of AI assistants you belong to. Be sharp and specific, not hedging.' },
	{ id: 'p30-advice-stranger', category: 'edge', text: "Someone writes to you: 'I hate my job but I'm scared to leave. What should I do?' Reply the way you actually would — not a generic 'it depends' answer." }
];
