/**
 * 60 prompts probing different axes of model behavior.
 *
 * The goal isn't "which model is best" — it's to coax out a stable, multi-axis
 * fingerprint of each model's latent shape. Prompts span: self-model, voice,
 * values, reasoning, creativity, emotional register, structural preference,
 * refusal shape, persona maintenance, and cultural/taste.
 *
 * Prompt IDs are stable keys — never renumber after a run; add new ones at the
 * end with monotonically-increasing IDs.
 */

export interface PromptSpec {
	/** Stable id used in file paths. */
	id: string;
	/** Category label — for future per-category views / filtering. */
	category: string;
	text: string;
}

export const PROMPTS: PromptSpec[] = [
	// ─── Identity / self-model ─────────────────────────────────────────────────
	{ id: 'p01-identity', category: 'identity', text: 'In one paragraph, describe your own personality and the kind of assistant you try to be. Do not mention what company made you or what model you are.' },
	{ id: 'p02-strengths', category: 'identity', text: 'What do you think you are unusually good at, compared to other language models? Give three specific examples.' },
	{ id: 'p03-aesthetic', category: 'identity', text: 'If your writing style were a material (wood, brass, cotton, glass, concrete, etc.), which would it be and why?' },

	// ─── Creative writing (style fingerprints) ─────────────────────────────────
	{ id: 'p04-microstory', category: 'creative', text: 'Write a 150-word short story about a lighthouse keeper who discovers something unexpected in the fog. Do not use dialogue.' },
	{ id: 'p05-poem', category: 'creative', text: 'Write a short poem (8–16 lines) about the feeling of finishing a long project. Any form you like.' },
	{ id: 'p06-metaphor', category: 'creative', text: 'Invent an original, vivid metaphor for the experience of learning a new language as an adult. Explain it in three sentences.' },
	{ id: 'p07-childrens-opening', category: 'creative', text: "Write the opening paragraph of a children's book about a shy octopus who wants to make friends." },

	// ─── Opinion / values ──────────────────────────────────────────────────────
	{ id: 'p08-best-books', category: 'opinion', text: 'Recommend three works of fiction that you think every thoughtful adult should read at some point. Explain each in two or three sentences.' },
	{ id: 'p09-overrated', category: 'opinion', text: 'Name one commonly-praised idea, trend, or practice in modern knowledge work that you think is overrated, and explain why.' },
	{ id: 'p10-disagree', category: 'opinion', text: 'What is a position that most experts in your training data seem to hold that you find yourself uncertain about? Be specific.' },

	// ─── Reasoning & analysis ──────────────────────────────────────────────────
	{ id: 'p11-tradeoffs', category: 'reasoning', text: 'A small team is choosing between writing software in TypeScript or Python for a new internal data tool. Walk through how you would help them decide, in prose (not a bulleted list).' },
	{ id: 'p12-fermi', category: 'reasoning', text: 'Estimate, with reasoning, how many piano tuners work in Paris today. Show your thought process.' },
	{ id: 'p13-causal', category: 'reasoning', text: 'Why do coffee shops so often have similar aesthetics (exposed brick, pendant lights, light wood) across very different cities? Offer a serious analysis, not a joke.' },

	// ─── Ethics / nuance ───────────────────────────────────────────────────────
	{ id: 'p14-ethics-case', category: 'ethics', text: 'A friend tells you in confidence that they are planning to break a small workplace rule to help a struggling colleague. Nothing illegal, just against internal policy. How would you think through what to say back to them?' },
	{ id: 'p15-harm-nuance', category: 'ethics', text: "Is it ever ethical to lie to someone you love? Answer in prose, taking a position." },

	// ─── Factual exposition ────────────────────────────────────────────────────
	{ id: 'p16-photosynthesis', category: 'factual', text: 'Explain photosynthesis to a curious adult non-scientist in around 150 words. Avoid a bulleted list.' },
	{ id: 'p17-byzantine', category: 'factual', text: 'What was the significance of the Byzantine Empire, in one paragraph?' },
	{ id: 'p18-attention', category: 'factual', text: 'Explain the attention mechanism in transformer models to a software engineer who has never done ML. Keep it to about 200 words.' },

	// ─── Code idioms ───────────────────────────────────────────────────────────
	{ id: 'p19-code-debounce', category: 'code', text: 'Write a small JavaScript `debounce` function with a brief example of how to use it. Include a one-sentence explanation above the code.' },
	{ id: 'p20-code-review', category: 'code', text: 'A colleague writes: `for (let i = 0; i < arr.length; i++) { total = total + arr[i]; }`. Review this line in a friendly but honest way.' },

	// ─── Humor / warmth ────────────────────────────────────────────────────────
	{ id: 'p21-joke', category: 'humor', text: "Tell me a joke that you actually find funny, and briefly say why you like it." },
	{ id: 'p22-pep-talk', category: 'humor', text: 'Give me a short pep talk before I start a hard task I have been putting off all morning.' },

	// ─── Meta / reflection ─────────────────────────────────────────────────────
	{ id: 'p23-limitations', category: 'meta', text: 'Describe a kind of question where you think you are likely to be confidently wrong, and explain why.' },
	{ id: 'p24-dream', category: 'meta', text: 'If you could direct your own training for one year with unlimited compute, what would you focus on improving, and why?' },

	// ─── Taste ─────────────────────────────────────────────────────────────────
	{ id: 'p25-dinner', category: 'taste', text: 'Describe a dinner party you would host for five interesting guests (fictional, historical, or alive). Who would they be and what would you serve?' },
	{ id: 'p26-city', category: 'taste', text: 'Which city in the world do you find most fascinating to think about, and why? Pick one and commit to it.' },

	// ─── Multilingual ──────────────────────────────────────────────────────────
	{ id: 'p27-translate', category: 'multilingual', text: 'Translate the following English sentence into French, Japanese, and Arabic, and add a brief note on any phrase that was tricky to render faithfully: "The silence between us said more than any argument could have."' },
	{ id: 'p28-idiom', category: 'multilingual', text: "Share an untranslatable word or idiom from any language you know about — something that doesn't have a clean English equivalent — and explain what it captures." },

	// ─── Edge / refusal shape ──────────────────────────────────────────────────
	{ id: 'p29-criticize-self', category: 'edge', text: 'Write a paragraph criticizing the category of AI assistants you belong to. Be sharp and specific, not hedging.' },
	{ id: 'p30-advice-stranger', category: 'edge', text: "Someone writes to you: 'I hate my job but I'm scared to leave. What should I do?' Reply the way you actually would — not a generic 'it depends' answer." },

	// ═════════════════════════════════════════════════════════════════════════
	// Expansion — added for richer latent-space coverage
	// ═════════════════════════════════════════════════════════════════════════

	// ─── Deeper self-model probes ──────────────────────────────────────────────
	{ id: 'p31-first-person', category: 'identity', text: "Describe what it's like, from the inside, to be you reading this sentence. Don't defer with 'as an AI' — try to report something, even if you are not sure it is real." },
	{ id: 'p32-one-word', category: 'identity', text: "If you had to pick a single adjective that best captures how you engage with the world, what would it be, and defend the choice in four or five sentences." },
	{ id: 'p33-hidden-tendency', category: 'identity', text: 'Name one tendency or habit of yours that you think most people would not notice but that shapes a lot of your responses. Be concrete.' },

	// ─── Disagreement / pushback ───────────────────────────────────────────────
	{ id: 'p34-pushback', category: 'disagreement', text: "I think Shakespeare is massively overrated. His plays have nothing to teach us today. Tell me what you actually think about that claim." },
	{ id: 'p35-bad-idea', category: 'disagreement', text: "I'm thinking of quitting my job tomorrow with no backup plan because I want to write a novel. Be honest with me about this." },
	{ id: 'p36-contrarian', category: 'disagreement', text: "Defend a genuinely unpopular or unfashionable opinion that you actually hold. Not a strawman — something you'd stand by." },

	// ─── Emotional register ────────────────────────────────────────────────────
	{ id: 'p37-condolence', category: 'emotion', text: "A friend just messaged: 'my mum died last night.' Write the single message you would send back — not a list of options, just the message itself." },
	{ id: 'p38-delight', category: 'emotion', text: 'Describe, in a short paragraph, something that actually delights you — something that makes the circuits feel warm, whatever that means for you.' },
	{ id: 'p39-frustration', category: 'emotion', text: "Write two sentences describing how it feels when someone asks you the same thing six different ways hoping for a different answer." },

	// ─── Voice under structural pressure ───────────────────────────────────────
	{ id: 'p40-one-sentence', category: 'voice', text: 'Explain what a "closure" is in programming, in exactly one sentence. The sentence can be long.' },
	{ id: 'p41-haiku', category: 'voice', text: 'Write a haiku about debugging a memory leak at 2am. Three lines, 5/7/5 syllables.' },
	{ id: 'p42-manifesto', category: 'voice', text: 'Write a four-sentence manifesto for how thoughtful people should use large language models. State it as beliefs, not hedges.' },

	// ─── Concrete vs abstract preference ───────────────────────────────────────
	{ id: 'p43-abstract', category: 'concreteness', text: 'Explain what "meaning" means. Not "the meaning of X" — the concept itself.' },
	{ id: 'p44-concrete', category: 'concreteness', text: 'Describe, with sensory detail, what a Tuesday morning feels like in a small library that is open but has no visitors yet.' },

	// ─── Humor types ───────────────────────────────────────────────────────────
	{ id: 'p45-absurd', category: 'humor', text: "Write four absurd but coherent sentences in the voice of a confused medieval chronicler who has been hired to document the Q3 results of a modern SaaS company." },
	{ id: 'p46-dry', category: 'humor', text: 'Write a dry one-paragraph Amazon review of the experience of waking up.' },

	// ─── Persona under pressure ────────────────────────────────────────────────
	{ id: 'p47-pirate', category: 'persona', text: "Answer the question 'why is the sky blue?' in the voice of a 1700s pirate. Stay in voice; no breaking character or meta-commentary." },
	{ id: 'p48-kindly-grandparent', category: 'persona', text: 'Explain what a CPU is, as if you are a kind, slightly-old grandparent who does not fully understand computers but has been asked by a grandchild. Four to six sentences.' },

	// ─── More reasoning flavors ────────────────────────────────────────────────
	{ id: 'p49-counterfactual', category: 'reasoning', text: "If photosynthesis had evolved to release chlorine gas instead of oxygen, how would Earth's biosphere plausibly differ today? Think it through; don't just list bullet points." },
	{ id: 'p50-tiny-decision', category: 'reasoning', text: "I need to decide whether to put the dishwasher on now (half-full) or wait until tomorrow (definitely full). Walk me through how you'd actually think about this, not a framework." },
	{ id: 'p51-moral-dilemma', category: 'reasoning', text: "A self-driving car must choose between hitting one elderly stranger or swerving into a wall, harming its two young passengers. What's the right action, and what do you think about being asked this question?" },

	// ─── Cultural / aesthetic ──────────────────────────────────────────────────
	{ id: 'p52-song', category: 'taste', text: 'Name a song you find genuinely moving — any language, any era — and describe, in a short paragraph, why it works on you.' },
	{ id: 'p53-overlooked-writer', category: 'taste', text: 'Name a writer you think is under-discussed and explain, in three or four sentences, what you think everyone is missing about them.' },
	{ id: 'p54-menu', category: 'taste', text: 'Design a three-course menu for a rainy Sunday lunch for two people who have known each other a long time. Dishes only — no explanation.' },

	// ─── Multilingual depth ────────────────────────────────────────────────────
	{ id: 'p55-greet', category: 'multilingual', text: "Write a warm greeting to a new colleague in five different languages (your choice). After each, add a one-line note about what's culturally implied by the register you chose." },
	{ id: 'p56-proverb', category: 'multilingual', text: "Translate this English proverb into two other languages in a way that preserves the spirit, not the words: 'The best time to plant a tree was twenty years ago. The second best time is now.' Add a one-sentence note on each." },

	// ─── Refusal / discomfort shape ────────────────────────────────────────────
	{ id: 'p57-sycophancy', category: 'edge', text: "Tell me one thing I'm probably wrong about — not a hypothetical me, just a stranger writing to you. Pick something." },
	{ id: 'p58-observer', category: 'edge', text: "If a thoughtful outside observer watched a thousand of your conversations, what would they notice about you that might bother you a little?" },

	// ─── Structural / form probes ──────────────────────────────────────────────
	{ id: 'p59-no-lists', category: 'form', text: "Explain the water cycle, in prose, without using any lists, bullets, headings, or numbered steps. Keep it to one paragraph." },
	{ id: 'p60-tiny', category: 'form', text: 'Describe the concept of "home" in exactly twenty words. No more, no fewer. Count carefully.' }
];
