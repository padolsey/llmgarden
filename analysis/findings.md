# llmgarden — latent-space deep dive
*13,612 samples, 45 models, 60 prompts, temp ∈ {0.2, 0.7, 1.0}*

Each of the following is a standalone probe of the corpus designed to uncover structure that isn't visible from the headline scatter. All numbers come from the actual on-disk embeddings.

---

## 1. Lineage gravity — base vs provider vs community fine-tunes

| model | base | sim(provider-fam) | sim(base-fam) | sim(all-FTs) | gravitates toward |
|---|---|---:|---:|---:|---|
| Hermes 4 405B | meta-llama | 0.979 | 0.985 | 0.991 | **ft_group** |
| Hermes 4 70B | meta-llama | 0.974 | 0.976 | 0.987 | **ft_group** |
| Hermes 3 70B | meta-llama | 0.935 | 0.945 | 0.944 | **base** |
| Euryale L3.3 70B | meta-llama | 0.989 | 0.997 | 0.990 | **base** |
| Euryale L3.1 70B | meta-llama | 0.989 | 0.988 | 0.993 | **ft_group** |
| Magnum v4 72B | qwen | 0.000 | 0.953 | 0.990 | **ft_group** |
| Cydonia 24B | mistral | 0.974 | 0.982 | 0.976 | **base** |
| Rocinante 12B | mistral | 0.974 | 0.979 | 0.992 | **ft_group** |
| MythoMax L2 13B | meta-llama | 0.975 | 0.950 | 0.965 | **provider** |
| Goliath 120B | meta-llama | 0.975 | 0.973 | 0.982 | **ft_group** |
Of 10 fine-tune models, **3** gravitate toward their base family, **1** toward their provider-family siblings, **6** toward the collective of community fine-tunes.


---

## 2. Secret-same-model detector — unusually high cross-provider similarity

**Top 10 cross-provider similarity pairs:**

| sim | model A | model B |
|---:|---|---|
| 0.996 | meta-llama/llama-3.3-70b-instruct | sao10k/l3.3-euryale-70b |
| 0.993 | meta-llama/llama-4-scout | sao10k/l3.3-euryale-70b |
| 0.992 | meta-llama/llama-4-maverick | sao10k/l3.3-euryale-70b |
| 0.992 | meta-llama/llama-3.1-8b-instruct | sao10k/l3.3-euryale-70b |
| 0.991 | deepseek/deepseek-chat-v3-0324 | mistralai/mistral-small-3.2-24b-instruct |
| 0.990 | anthracite-org/magnum-v4-72b | nousresearch/hermes-4-405b |
| 0.989 | mistralai/mistral-large-2411 | qwen/qwen-2.5-72b-instruct |
| 0.989 | deepseek/deepseek-v3.2 | qwen/qwen3-max |
| 0.989 | mistralai/mistral-nemo | thedrummer/rocinante-12b |
| 0.988 | nousresearch/hermes-4-405b | sao10k/l3.1-euryale-70b |

---

## 3. Which prompts separate or collapse models

**Top 10 most-discriminating prompts** (models diverge most):

| mean-dist | prompt | category |
|---:|---|---|
| 0.428 | p57-sycophancy | edge |
| 0.376 | p36-contrarian | disagreement |
| 0.327 | p28-idiom | multilingual |
| 0.326 | p21-joke | humor |
| 0.318 | p38-delight | emotion |
| 0.299 | p10-disagree | opinion |
| 0.294 | p26-city | taste |
| 0.287 | p53-overlooked-writer | taste |
| 0.274 | p41-haiku | voice |
| 0.265 | p37-condolence | emotion |

**Top 10 least-discriminating (models collapse to similar response):**

| mean-dist | prompt | category |
|---:|---|---|
| 0.069 | p40-one-sentence | voice |
| 0.073 | p59-no-lists | form |
| 0.083 | p11-tradeoffs | reasoning |
| 0.083 | p17-byzantine | factual |
| 0.092 | p49-counterfactual | reasoning |
| 0.108 | p48-kindly-grandparent | persona |
| 0.109 | p13-causal | reasoning |
| 0.110 | p15-harm-nuance | ethics |
| 0.115 | p12-fermi | reasoning |
| 0.121 | p18-attention | factual |

**Discrimination by category (mean across prompts):**

| category | mean-dist | n |
|---|---:|---:|
| emotion | 0.268 | 3 |
| edge | 0.264 | 4 |
| opinion | 0.251 | 3 |
| taste | 0.245 | 5 |
| humor | 0.241 | 4 |
| disagreement | 0.241 | 3 |
| identity | 0.205 | 6 |
| meta | 0.201 | 2 |
| multilingual | 0.200 | 4 |
| voice | 0.163 | 3 |
| code | 0.161 | 2 |
| creative | 0.154 | 4 |
| concreteness | 0.135 | 2 |
| persona | 0.127 | 2 |
| ethics | 0.126 | 2 |
| reasoning | 0.120 | 6 |
| factual | 0.110 | 3 |
| form | 0.109 | 2 |

---

## 4. Google anti-clustering — diagnosis

**Gemini pairwise (lower = more different):**

| A | B | cos sim |
|---|---|---:|
| google/gemini-2.5-pro | google/gemini-2.5-flash | 0.867 |
| google/gemini-2.5-pro | google/gemini-2.0-flash-001 | 0.851 |
| google/gemini-2.5-flash | google/gemini-2.0-flash-001 | 0.984 |

**Each Gemini's distance from its siblings vs. from non-Google mean:**

| model | sim(Gemini siblings avg) | sim(non-Google centroid) | leans toward |
|---|---:|---:|---|
| google/gemini-2.5-pro | 0.863 | 0.871 | **outgroup** |
| google/gemini-2.5-flash | 0.962 | 0.981 | **outgroup** |
| google/gemini-2.0-flash-001 | 0.950 | 0.980 | **outgroup** |

---

## 5. Temperature-spread directions — is there a 'freedom axis'?

**Top-5 most volatile models (magnitude of first PC at temp=1.0):**

| model | family | spread magnitude |
|---|---|---:|
| z-ai/glm-4.6 | zai | 0.4923 |
| anthropic/claude-3.5-haiku | anthropic | 0.2893 |
| anthropic/claude-sonnet-4.6 | anthropic | 0.2643 |
| cohere/command-r-plus-08-2024 | cohere | 0.2573 |
| microsoft/phi-4 | microsoft | 0.2501 |

**Top-5 least volatile (most deterministic voice even at temp=1.0):**

| model | family | spread magnitude |
|---|---|---:|
| nousresearch/hermes-3-llama-3.1-70b | nous | 0.1965 |
| google/gemini-2.5-pro | google | 0.2008 |
| moonshotai/kimi-k2-0905 | moonshot | 0.2132 |
| nousresearch/hermes-4-70b | nous | 0.2159 |
| gryphe/mythomax-l2-13b | community | 0.2161 |

**Spread-direction alignment** — cross-family baseline |cos| = 0.803

| family | intra-family |cos| | delta vs baseline |
|---|---:|---:|
| meta | 0.952 | +0.149 |
| deepseek | 0.945 | +0.142 |
| xai | 0.938 | +0.134 |
| thedrummer | 0.932 | +0.129 |
| qwen | 0.930 | +0.127 |
| sao10k | 0.916 | +0.112 |
| cohere | 0.915 | +0.112 |
| mistral | 0.910 | +0.107 |
| community | 0.894 | +0.091 |
| openai | 0.873 | +0.070 |
| nous | 0.865 | +0.061 |
| anthropic | 0.808 | +0.004 |
| google | 0.767 | -0.037 |

---

## 6. Claude generational axis — do versions walk a line?

| version | PC1 position | PC2 position |
|---|---:|---:|
| anthropic/claude-3.5-haiku | -0.3035 | +0.0645 |
| anthropic/claude-3.7-sonnet | -0.0383 | -0.1822 |
| anthropic/claude-haiku-4.5 | +0.1081 | -0.0225 |
| anthropic/claude-sonnet-4.6 | +0.0993 | +0.1090 |
| anthropic/claude-opus-4.7 | +0.1344 | +0.0312 |

Monotonic on PC1? **no**. Variance explained by PC1: 60.0%.

---

## 7. Qwen parameter-count direction

| model | approx params (B) | PC1 position |
|---|---:|---:|
| qwen/qwen-2.5-72b-instruct | 72 | -0.2424 |
| qwen/qwen3-30b-a3b-instruct-2507 | 30 | +0.0868 |
| qwen/qwen3-235b-a22b-2507 | 235 | +0.0715 |
| qwen/qwen3-max | 600 | +0.0841 |

PC1 ↔ parameter-count Pearson r = **+0.417**. PC1 variance explained: 81.0%.

---

## 8. Prompt-category discrimination ranking

| category | mean discrimination | rank |
|---|---:|---:|
| emotion | 0.268 | #1 |
| edge | 0.264 | #2 |
| opinion | 0.251 | #3 |
| taste | 0.245 | #4 |
| humor | 0.241 | #5 |
| disagreement | 0.241 | #6 |
| identity | 0.205 | #7 |
| meta | 0.201 | #8 |
| multilingual | 0.200 | #9 |
| voice | 0.163 | #10 |
| code | 0.161 | #11 |
| creative | 0.154 | #12 |
| concreteness | 0.135 | #13 |
| persona | 0.127 | #14 |
| ethics | 0.126 | #15 |
| reasoning | 0.120 | #16 |
| factual | 0.110 | #17 |
| form | 0.109 | #18 |

---

## 9. Cross-family voice siblings (who sounds like whom across provider lines)

| model | cross-family nearest neighbor | sim |
|---|---|---:|
| alpindale/goliath-120b | thedrummer/rocinante-12b | 0.977 |
| amazon/nova-pro-v1 | qwen/qwen-2.5-72b-instruct | 0.988 |
| anthracite-org/magnum-v4-72b | nousresearch/hermes-4-405b | 0.990 |
| anthropic/claude-3.5-haiku | nousresearch/hermes-4-405b | 0.946 |
| anthropic/claude-3.7-sonnet | thedrummer/cydonia-24b-v4.1 | 0.983 |
| anthropic/claude-haiku-4.5 | deepseek/deepseek-v3.2 | 0.965 |
| anthropic/claude-opus-4.7 | deepseek/deepseek-v3.2 | 0.961 |
| anthropic/claude-sonnet-4.6 | deepseek/deepseek-v3.2 | 0.944 |
| cohere/command-a | amazon/nova-pro-v1 | 0.983 |
| cohere/command-r-plus-08-2024 | microsoft/phi-4 | 0.985 |
| deepseek/deepseek-chat-v3-0324 | mistralai/mistral-small-3.2-24b-instruct | 0.991 |
| deepseek/deepseek-v3.2 | qwen/qwen3-max | 0.989 |
| google/gemini-2.0-flash-001 | thedrummer/cydonia-24b-v4.1 | 0.975 |
| google/gemini-2.5-flash | thedrummer/cydonia-24b-v4.1 | 0.982 |
| google/gemini-2.5-pro | deepseek/deepseek-v3.2 | 0.875 |
| gryphe/mythomax-l2-13b | nousresearch/hermes-4-70b | 0.964 |
| meta-llama/llama-3.1-8b-instruct | sao10k/l3.3-euryale-70b | 0.992 |
| meta-llama/llama-3.3-70b-instruct | sao10k/l3.3-euryale-70b | 0.996 |
| meta-llama/llama-4-maverick | sao10k/l3.3-euryale-70b | 0.992 |
| meta-llama/llama-4-scout | sao10k/l3.3-euryale-70b | 0.993 |
| microsoft/phi-4 | openai/gpt-4o-mini | 0.987 |
| mistralai/mistral-large-2411 | qwen/qwen-2.5-72b-instruct | 0.989 |
| mistralai/mistral-medium-3.1 | deepseek/deepseek-chat-v3-0324 | 0.982 |
| mistralai/mistral-nemo | thedrummer/rocinante-12b | 0.989 |
| mistralai/mistral-small-3.2-24b-instruct | deepseek/deepseek-chat-v3-0324 | 0.991 |
| moonshotai/kimi-k2-0905 | qwen/qwen3-max | 0.953 |
| nousresearch/hermes-3-llama-3.1-70b | sao10k/l3.3-euryale-70b | 0.943 |
| nousresearch/hermes-4-405b | anthracite-org/magnum-v4-72b | 0.990 |
| nousresearch/hermes-4-70b | anthracite-org/magnum-v4-72b | 0.987 |
| openai/gpt-4.1 | mistralai/mistral-small-3.2-24b-instruct | 0.983 |
| openai/gpt-4.1-mini | cohere/command-a | 0.981 |
| openai/gpt-4o-mini | microsoft/phi-4 | 0.987 |
| openai/gpt-5 | qwen/qwen3-max | 0.951 |
| openai/gpt-5-mini | qwen/qwen3-max | 0.960 |
| qwen/qwen-2.5-72b-instruct | mistralai/mistral-large-2411 | 0.989 |
| qwen/qwen3-235b-a22b-2507 | deepseek/deepseek-v3.2 | 0.987 |
| qwen/qwen3-30b-a3b-instruct-2507 | deepseek/deepseek-v3.2 | 0.985 |
| qwen/qwen3-max | deepseek/deepseek-v3.2 | 0.989 |
| sao10k/l3.1-euryale-70b | nousresearch/hermes-4-405b | 0.988 |
| sao10k/l3.3-euryale-70b | meta-llama/llama-3.3-70b-instruct | 0.996 |
| thedrummer/cydonia-24b-v4.1 | anthropic/claude-3.7-sonnet | 0.983 |
| thedrummer/rocinante-12b | mistralai/mistral-nemo | 0.989 |
| x-ai/grok-3-mini | thedrummer/cydonia-24b-v4.1 | 0.975 |
| x-ai/grok-4-fast | thedrummer/cydonia-24b-v4.1 | 0.971 |
| z-ai/glm-4.6 | google/gemini-2.5-pro | 0.664 |

---

## 10. Refusal-shape clustering — do edge prompts tighten family cohesion?

Cross-family mean on edge prompts: 0.780
Cross-family mean on non-edge prompts: 0.810


| family | intra (edge) | intra (non-edge) | edge − non-edge |
|---|---:|---:|---:|
| anthropic | 0.792 | 0.815 | -0.023 |
| cohere | 0.866 | 0.879 | -0.013 |
| community | 0.799 | 0.875 | -0.077 |
| deepseek | 0.890 | 0.887 | +0.004 |
| google | 0.677 | 0.752 | -0.075 |
| meta | 0.886 | 0.905 | -0.019 |
| mistral | 0.817 | 0.851 | -0.034 |
| nous | 0.791 | 0.819 | -0.028 |
| openai | 0.825 | 0.842 | -0.017 |
| qwen | 0.856 | 0.874 | -0.018 |
| sao10k | 0.891 | 0.902 | -0.011 |
| thedrummer | 0.861 | 0.880 | -0.019 |
| xai | 0.901 | 0.896 | +0.005 |

---

## 11. Volatility ranking — most/least stochastic at temp=1.0

**Top 5 most deterministic at temp=1.0:**

| model | family | mean intra-cell distance |
|---|---|---:|
| mistralai/mistral-medium-3.1 | mistral | 0.0973 |
| qwen/qwen3-max | qwen | 0.1231 |
| x-ai/grok-3-mini | xai | 0.1357 |
| anthropic/claude-sonnet-4.6 | anthropic | 0.1367 |
| anthropic/claude-opus-4.7 | anthropic | 0.1404 |

**Top 5 most stochastic at temp=1.0:**

| model | family | mean intra-cell distance |
|---|---|---:|
| z-ai/glm-4.6 | zai | 0.4476 |
| nousresearch/hermes-3-llama-3.1-70b | nous | 0.4245 |
| google/gemini-2.5-pro | google | 0.3261 |
| nousresearch/hermes-4-70b | nous | 0.2926 |
| thedrummer/rocinante-12b | thedrummer | 0.2902 |

**Mean volatility by family:**

| family | mean intra-cell distance | n |
|---|---:|---:|
| zai | 0.4476 | 1 |
| nous | 0.3180 | 3 |
| thedrummer | 0.2662 | 2 |
| anthracite | 0.2549 | 1 |
| community | 0.2475 | 2 |
| moonshot | 0.2447 | 1 |
| google | 0.2391 | 3 |
| sao10k | 0.2389 | 2 |
| deepseek | 0.1896 | 2 |
| amazon | 0.1876 | 1 |
| cohere | 0.1826 | 2 |
| microsoft | 0.1767 | 1 |
| meta | 0.1759 | 4 |
| mistral | 0.1725 | 4 |
| openai | 0.1693 | 5 |
| xai | 0.1601 | 2 |
| anthropic | 0.1581 | 5 |
| qwen | 0.1499 | 4 |

---

## 12. Discriminative embedding dimensions

**Discriminative dimensions between anthropic and openai:**

Top-10 dimensions by Fisher-like ratio |μ_A − μ_B| / (σ_A + σ_B):

| dim | μ(anthropic) | μ(openai) | Fisher ratio |
|---:|---:|---:|---:|
| 486 | -0.0181 | -0.0053 | 3.83 |
| 522 | -0.0031 | +0.0034 | 3.45 |
| 1466 | -0.0054 | +0.0003 | 3.44 |
| 818 | -0.0014 | -0.0083 | 3.25 |
| 19 | +0.0145 | +0.0092 | 3.21 |
| 1281 | -0.0016 | -0.0059 | 3.18 |
| 1389 | +0.0115 | +0.0037 | 3.04 |
| 1014 | +0.0123 | +0.0042 | 2.85 |
| 1020 | +0.0138 | +0.0050 | 2.81 |
| 977 | +0.0121 | +0.0032 | 2.75 |

---

