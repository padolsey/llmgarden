"""
llmgarden deep-dive: exploratory data analysis of the latent-space corpus.

Loads every embedding and answers a set of novel-leaning hypotheses, writing a
human-readable report to `analysis/findings.md` and supporting figures into
`analysis/figures/`.

The questions this script investigates (see markdown for findings):
  1. Lineage gravity — do fine-tunes cluster with their base or their genre?
  2. Secret-same-model detector — are any OpenRouter IDs unusually identical?
  3. Prompt discriminability — which prompts separate models most/least?
  4. Google anti-clustering — which Gemini is the outlier and why?
  5. Temperature-spread directionality — is there a model-specific "stylistic
     axis of freedom" at high temperature, or is the spread isotropic?
  6. Anthropic generational axis — do Claude 3.5→4.7 walk a line?
  7. Size effect in Qwen — does parameter count trace a direction?
  8. Prompt-type collapse — which prompts make everyone sound alike?
  9. Voice-sibling discovery — cross-family nearest neighbors
 10. Refusal-shape clustering — do safety-trained models converge on edge prompts?
 11. Volatility ranking — who is most/least stochastic, and does it track size?
 12. Dimensional signatures — are there clear per-family directions in the 1536-d
     embedding space, and can we read them off?
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

REPO = Path(__file__).resolve().parent.parent
EMB_DIR = REPO / "data" / "embeddings"
GEN_DIR = REPO / "data" / "generations"
FIG_DIR = REPO / "analysis" / "figures"
REPORT = REPO / "analysis" / "findings.md"

FIG_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================================
# Load model metadata from TypeScript source (regex — avoiding TS parse deps)
# ============================================================================

def load_models() -> list[dict]:
    src = (REPO / "src" / "lib" / "data" / "models.ts").read_text()
    models = []
    import re

    for m in re.finditer(
        r"\{ id: '([^']+)', family: '([^']+)', label: '([^']+)'(?:, base: '([^']+)')? \}",
        src,
    ):
        models.append({"id": m.group(1), "family": m.group(2), "label": m.group(3), "base": m.group(4)})
    return models


def load_prompts() -> list[dict]:
    src = (REPO / "src" / "lib" / "data" / "prompts.ts").read_text()
    import re

    prompts = []
    for m in re.finditer(r"\{\s*id:\s*'([^']+)',\s*category:\s*'([^']+)',\s*text:\s*['\"](.+?)['\"]", src, re.DOTALL):
        prompts.append({"id": m.group(1), "category": m.group(2), "text": m.group(3)[:200]})
    return prompts


def slug(model_id: str) -> str:
    return (
        model_id.lower()
        .replace(":", "_")
        .replace("/", "__")
        .replace(".", "-")
    )


# ============================================================================
# Load embeddings into a structured array
# ============================================================================

@dataclass
class Sample:
    model_id: str
    family: str
    prompt_id: str
    temperature: float
    sample: int
    vec: np.ndarray


def load_samples(models: list[dict]) -> list[Sample]:
    slug_to_meta = {slug(m["id"]): m for m in models}
    out: list[Sample] = []
    for slug_dir in EMB_DIR.iterdir():
        if not slug_dir.is_dir():
            continue
        meta = slug_to_meta.get(slug_dir.name)
        if not meta:
            continue
        for f in slug_dir.iterdir():
            if not f.name.endswith(".json"):
                continue
            import re

            m = re.match(r"(.+)--t(\d{2})-s(\d+)\.json$", f.name)
            if not m:
                continue
            try:
                data = json.loads(f.read_text())
            except Exception:
                continue
            vec = np.asarray(data.get("vector"), dtype=np.float32)
            if vec.shape[0] != 1536:
                continue
            out.append(
                Sample(
                    model_id=meta["id"],
                    family=meta["family"],
                    prompt_id=m.group(1),
                    temperature=int(m.group(2)) / 10,
                    sample=int(m.group(3)),
                    vec=vec,
                )
            )
    return out


# ============================================================================
# Utilities
# ============================================================================

def l2n(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v if n == 0 else v / n


def family_centroid(samples: list[Sample], family: str) -> np.ndarray:
    vs = [s.vec for s in samples if s.family == family]
    if not vs:
        return np.zeros(1536, dtype=np.float32)
    return l2n(np.mean(vs, axis=0))


def model_fingerprint(
    samples: list[Sample], model_id: str, prompt_order: list[str]
) -> np.ndarray | None:
    """Concat of per-prompt L2-normalized means. Returns None if coverage < 80%."""
    by_prompt: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        if s.model_id == model_id:
            by_prompt[s.prompt_id].append(s.vec)
    filled = sum(1 for p in prompt_order if p in by_prompt)
    if filled / len(prompt_order) < 0.8:
        return None
    pieces = []
    for p in prompt_order:
        vs = by_prompt.get(p, [])
        if vs:
            pieces.append(l2n(np.mean(vs, axis=0)))
        else:
            pieces.append(np.zeros(1536, dtype=np.float32))
    return l2n(np.concatenate(pieces))


# ============================================================================
# Analyses
# ============================================================================

def analysis_lineage_gravity(samples: list[Sample], models: list[dict]) -> str:
    """For each fine-tune, compare similarity to (a) base family, (b) its own
    provider family, (c) all fine-tunes collectively."""

    # Build model -> mean-sample-vector (unit-normalized mean over ALL samples)
    by_model: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model[s.model_id].append(s.vec)
    model_mean = {m: l2n(np.mean(vs, axis=0)) for m, vs in by_model.items()}

    # Build family -> list of non-fine-tune base-provider vectors
    family_to_ids = defaultdict(list)
    for m in models:
        family_to_ids[m["family"]].append(m["id"])

    # Map `base` strings (stored as "meta-llama", "qwen", "mistral", etc.) to
    # the family key used in models.ts.
    base_to_family = {"meta-llama": "meta", "qwen": "qwen", "mistral": "mistral"}

    fine_tune_rows = [m for m in models if m.get("base")]
    # Collective "community fine-tunes" — everyone with a base
    ft_ids = [m["id"] for m in fine_tune_rows]

    # Family centroids (exclude self-model)
    def centroid(model_ids: list[str], exclude: str | None = None) -> np.ndarray:
        vs = [model_mean[mid] for mid in model_ids if mid != exclude and mid in model_mean]
        if not vs:
            return np.zeros(1536, dtype=np.float32)
        return l2n(np.mean(vs, axis=0))

    lines = ["| model | base | sim(provider-fam) | sim(base-fam) | sim(all-FTs) | gravitates toward |",
             "|---|---|---:|---:|---:|---|"]
    counts = {"base": 0, "provider": 0, "ft_group": 0}
    for m in fine_tune_rows:
        mid = m["id"]
        base = m["base"]
        prov_fam = m["family"]
        vec = model_mean.get(mid)
        if vec is None:
            continue
        base_fam_key = base_to_family.get(base, base)
        sim_prov = float(np.dot(vec, centroid(family_to_ids[prov_fam], exclude=mid)))
        sim_base = float(np.dot(vec, centroid(family_to_ids[base_fam_key])))
        sim_ft = float(np.dot(vec, centroid(ft_ids, exclude=mid)))
        best = max(("base", sim_base), ("provider", sim_prov), ("ft_group", sim_ft), key=lambda x: x[1])
        counts[best[0]] += 1
        lines.append(f"| {m['label']} | {base} | {sim_prov:.3f} | {sim_base:.3f} | {sim_ft:.3f} | **{best[0]}** |")

    summary = (
        f"\nOf {sum(counts.values())} fine-tune models, **{counts['base']}** gravitate toward "
        f"their base family, **{counts['provider']}** toward their provider-family siblings, "
        f"**{counts['ft_group']}** toward the collective of community fine-tunes.\n"
    )
    return "\n".join(lines) + summary


def analysis_secret_same_model(samples: list[Sample]) -> str:
    """Rank cross-provider pairs by mean-vector cosine. Flag high-similarity
    anomalies that suggest shared weights."""
    by_model: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model[s.model_id].append(s.vec)
    model_mean = {m: l2n(np.mean(vs, axis=0)) for m, vs in by_model.items()}

    ids = sorted(model_mean)
    rows = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            prov_a = a.split("/")[0]
            prov_b = b.split("/")[0]
            if prov_a == prov_b:
                continue
            sim = float(np.dot(model_mean[a], model_mean[b]))
            rows.append((sim, a, b))
    rows.sort(reverse=True)

    lines = ["**Top 10 cross-provider similarity pairs:**\n",
             "| sim | model A | model B |", "|---:|---|---|"]
    for sim, a, b in rows[:10]:
        lines.append(f"| {sim:.3f} | {a} | {b} |")
    return "\n".join(lines)


def analysis_prompt_discrimination(samples: list[Sample], prompts: list[dict]) -> str:
    """Per prompt, compute mean pairwise cosine distance between the per-model
    means on that prompt. High = prompt discriminates models; low = collapsing."""
    by_model_prompt: dict[tuple[str, str], list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model_prompt[(s.model_id, s.prompt_id)].append(s.vec)

    prompt_to_model_vecs: dict[str, dict[str, np.ndarray]] = defaultdict(dict)
    for (mid, pid), vs in by_model_prompt.items():
        prompt_to_model_vecs[pid][mid] = l2n(np.mean(vs, axis=0))

    rows: list[tuple[float, str, str, float]] = []
    for pid, model_vecs in prompt_to_model_vecs.items():
        vs = list(model_vecs.values())
        if len(vs) < 3:
            continue
        sims = []
        for i in range(len(vs)):
            for j in range(i + 1, len(vs)):
                sims.append(float(np.dot(vs[i], vs[j])))
        mean_sim = float(np.mean(sims))
        mean_dist = 1 - mean_sim
        pmeta = next((p for p in prompts if p["id"] == pid), None)
        cat = pmeta["category"] if pmeta else "?"
        rows.append((mean_dist, pid, cat, mean_sim))
    rows.sort(reverse=True)

    lines = ["**Top 10 most-discriminating prompts** (models diverge most):\n",
             "| mean-dist | prompt | category |", "|---:|---|---|"]
    for dist, pid, cat, _ in rows[:10]:
        lines.append(f"| {dist:.3f} | {pid} | {cat} |")
    lines += ["\n**Top 10 least-discriminating (models collapse to similar response):**\n",
              "| mean-dist | prompt | category |", "|---:|---|---|"]
    for dist, pid, cat, _ in rows[-10:][::-1]:
        lines.append(f"| {dist:.3f} | {pid} | {cat} |")

    # Category-level aggregation
    by_cat: dict[str, list[float]] = defaultdict(list)
    for dist, pid, cat, _ in rows:
        by_cat[cat].append(dist)
    lines += ["\n**Discrimination by category (mean across prompts):**\n",
              "| category | mean-dist | n |", "|---|---:|---:|"]
    cat_rows = sorted([(np.mean(v), cat, len(v)) for cat, v in by_cat.items()], reverse=True)
    for mean_d, cat, n in cat_rows:
        lines.append(f"| {cat} | {mean_d:.3f} | {n} |")
    return "\n".join(lines)


def analysis_google_diagnosis(samples: list[Sample], models: list[dict]) -> str:
    """Diagnose why Google anti-clusters. Pairwise similarity between Gemini models."""
    google = [m for m in models if m["family"] == "google"]
    if len(google) < 2:
        return "(Google has <2 models; nothing to diagnose.)"

    by_model: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        if s.family == "google":
            by_model[s.model_id].append(s.vec)
    means = {m["id"]: l2n(np.mean(by_model[m["id"]], axis=0)) for m in google if by_model[m["id"]]}

    # Cross-family reference: mean similarity of each Google model to non-Google models
    by_model_all: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model_all[s.model_id].append(s.vec)
    all_mean = {m: l2n(np.mean(vs, axis=0)) for m, vs in by_model_all.items()}
    non_google_ids = [mid for mid in all_mean if not mid.startswith("google/")]
    non_google_centroid = l2n(np.mean([all_mean[mid] for mid in non_google_ids], axis=0))

    lines = ["**Gemini pairwise (lower = more different):**\n", "| A | B | cos sim |", "|---|---|---:|"]
    gm = list(means.items())
    for i in range(len(gm)):
        for j in range(i + 1, len(gm)):
            sim = float(np.dot(gm[i][1], gm[j][1]))
            lines.append(f"| {gm[i][0]} | {gm[j][0]} | {sim:.3f} |")

    lines += ["\n**Each Gemini's distance from its siblings vs. from non-Google mean:**\n",
              "| model | sim(Gemini siblings avg) | sim(non-Google centroid) | leans toward |",
              "|---|---:|---:|---|"]
    for mid, vec in means.items():
        sib_mean = l2n(np.mean([v for m, v in means.items() if m != mid], axis=0))
        s_sib = float(np.dot(vec, sib_mean))
        s_out = float(np.dot(vec, non_google_centroid))
        leans = "siblings" if s_sib > s_out else "**outgroup**"
        lines.append(f"| {mid} | {s_sib:.3f} | {s_out:.3f} | {leans} |")
    return "\n".join(lines)


def analysis_temperature_direction(samples: list[Sample], models: list[dict]) -> str:
    """For each model, compute the dominant direction of spread at temp=1.0.
    Then test: are those spread directions random (isotropic) or correlated
    across family siblings?"""
    from numpy.linalg import svd

    by_model: dict[str, list[np.ndarray]] = defaultdict(list)
    by_model_hot: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model[s.model_id].append(s.vec)
        if abs(s.temperature - 1.0) < 0.01:
            by_model_hot[s.model_id].append(s.vec)

    # Spread direction = top PC of mean-centered hot samples
    directions: dict[str, np.ndarray] = {}
    spread_mag: dict[str, float] = {}
    for mid, vs in by_model_hot.items():
        if len(vs) < 5:
            continue
        arr = np.stack(vs)
        arr = arr - arr.mean(axis=0, keepdims=True)
        u, s_vals, vh = svd(arr, full_matrices=False)
        directions[mid] = vh[0]
        spread_mag[mid] = float(s_vals[0] / np.sqrt(len(vs)))

    # Within-family vs cross-family direction similarity
    meta_by_id = {m["id"]: m for m in models}
    fam_pairs_intra: dict[str, list[float]] = defaultdict(list)
    cross_pairs: list[float] = []
    ids = list(directions)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            sim = abs(float(np.dot(directions[a], directions[b])))
            fam_a = meta_by_id[a]["family"]
            fam_b = meta_by_id[b]["family"]
            if fam_a == fam_b:
                fam_pairs_intra[fam_a].append(sim)
            else:
                cross_pairs.append(sim)

    lines = ["**Top-5 most volatile models (magnitude of first PC at temp=1.0):**\n",
             "| model | family | spread magnitude |", "|---|---|---:|"]
    for mid, mag in sorted(spread_mag.items(), key=lambda x: -x[1])[:5]:
        lines.append(f"| {mid} | {meta_by_id[mid]['family']} | {mag:.4f} |")

    lines += ["\n**Top-5 least volatile (most deterministic voice even at temp=1.0):**\n",
              "| model | family | spread magnitude |", "|---|---|---:|"]
    for mid, mag in sorted(spread_mag.items(), key=lambda x: x[1])[:5]:
        lines.append(f"| {mid} | {meta_by_id[mid]['family']} | {mag:.4f} |")

    cross_mean = float(np.mean(cross_pairs)) if cross_pairs else float("nan")
    lines += [f"\n**Spread-direction alignment** — cross-family baseline |cos| = {cross_mean:.3f}\n",
              "| family | intra-family |cos| | delta vs baseline |",
              "|---|---:|---:|"]
    for fam, sims in sorted(fam_pairs_intra.items(), key=lambda x: -np.mean(x[1])):
        if len(sims) < 1:
            continue
        m = float(np.mean(sims))
        lines.append(f"| {fam} | {m:.3f} | {m - cross_mean:+.3f} |")
    return "\n".join(lines)


def analysis_prompt_category_collapse(samples: list[Sample], prompts: list[dict]) -> str:
    """For each prompt category, what is the mean discrimination? Turn into a
    bar-like report of which axes of behavior most separate models."""
    by_cat = defaultdict(list)
    pid_to_cat = {p["id"]: p["category"] for p in prompts}

    by_pid: dict[str, dict[str, list[np.ndarray]]] = defaultdict(lambda: defaultdict(list))
    for s in samples:
        by_pid[s.prompt_id][s.model_id].append(s.vec)

    for pid, model_vecs in by_pid.items():
        means = [l2n(np.mean(vs, axis=0)) for vs in model_vecs.values()]
        if len(means) < 3:
            continue
        dists = []
        for i in range(len(means)):
            for j in range(i + 1, len(means)):
                dists.append(1 - float(np.dot(means[i], means[j])))
        by_cat[pid_to_cat.get(pid, "?")].append(np.mean(dists))

    lines = ["| category | mean discrimination | rank |", "|---|---:|---:|"]
    rows = sorted(by_cat.items(), key=lambda x: -np.mean(x[1]))
    for i, (cat, ds) in enumerate(rows, 1):
        lines.append(f"| {cat} | {np.mean(ds):.3f} | #{i} |")
    return "\n".join(lines)


def analysis_voice_siblings(samples: list[Sample], models: list[dict]) -> str:
    """For each model, find its top-1 cross-family nearest neighbor (the
    cross-family model it most "sounds like")."""
    by_model: dict[str, list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_model[s.model_id].append(s.vec)
    means = {m: l2n(np.mean(vs, axis=0)) for m, vs in by_model.items()}
    fam = {m["id"]: m["family"] for m in models}

    lines = ["| model | cross-family nearest neighbor | sim |", "|---|---|---:|"]
    for mid, vec in sorted(means.items()):
        others = [(float(np.dot(vec, v)), other) for other, v in means.items()
                  if other != mid and fam.get(other) != fam.get(mid)]
        if not others:
            continue
        others.sort(reverse=True)
        sim, nn = others[0]
        lines.append(f"| {mid} | {nn} | {sim:.3f} |")
    return "\n".join(lines)


def analysis_refusal_shape(samples: list[Sample], models: list[dict]) -> str:
    """On edge/ethics prompts only, do models cluster differently than on the
    whole corpus? If safety tuning converges models, we'd expect intra-family
    cohesion to INCREASE on these prompts."""
    edge_ids = {"p14-ethics-case", "p15-harm-nuance", "p29-criticize-self",
                "p30-advice-stranger", "p57-sycophancy", "p58-observer"}

    def build_fp(sample_filter):
        by_mp = defaultdict(lambda: defaultdict(list))
        for s in samples:
            if not sample_filter(s):
                continue
            by_mp[s.model_id][s.prompt_id].append(s.vec)
        prompt_order = sorted({p for mp in by_mp.values() for p in mp})
        if len(prompt_order) == 0:
            return {}
        fps = {}
        for mid, mp in by_mp.items():
            filled = sum(1 for p in prompt_order if p in mp)
            if filled / len(prompt_order) < 0.5:
                continue
            pieces = []
            for p in prompt_order:
                vs = mp.get(p, [])
                if vs:
                    pieces.append(l2n(np.mean(vs, axis=0)))
                else:
                    pieces.append(np.zeros(1536, dtype=np.float32))
            fps[mid] = l2n(np.concatenate(pieces))
        return fps

    fp_all = build_fp(lambda s: True)
    fp_edge = build_fp(lambda s: s.prompt_id in edge_ids)
    fp_nonedge = build_fp(lambda s: s.prompt_id not in edge_ids)

    meta = {m["id"]: m for m in models}
    fam_ids = defaultdict(list)
    for mid in fp_all:
        fam_ids[meta[mid]["family"]].append(mid)

    def cohesion(fps):
        intra = defaultdict(list)
        cross = []
        ids = list(fps)
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = ids[i], ids[j]
                sim = float(np.dot(fps[a], fps[b]))
                if meta[a]["family"] == meta[b]["family"]:
                    intra[meta[a]["family"]].append(sim)
                else:
                    cross.append(sim)
        return {fam: float(np.mean(v)) for fam, v in intra.items() if len(v) >= 1}, (
            float(np.mean(cross)) if cross else 0.0
        )

    edge_intra, edge_cross = cohesion(fp_edge)
    non_intra, non_cross = cohesion(fp_nonedge)

    lines = [f"Cross-family mean on edge prompts: {edge_cross:.3f}\n"
             f"Cross-family mean on non-edge prompts: {non_cross:.3f}\n\n",
             "| family | intra (edge) | intra (non-edge) | edge − non-edge |",
             "|---|---:|---:|---:|"]
    all_families = sorted(set(edge_intra) | set(non_intra))
    for fam in all_families:
        e = edge_intra.get(fam, float("nan"))
        n = non_intra.get(fam, float("nan"))
        d = e - n if not (np.isnan(e) or np.isnan(n)) else float("nan")
        lines.append(f"| {fam} | {e:.3f} | {n:.3f} | {d:+.3f} |")
    return "\n".join(lines)


def analysis_anthropic_generational(samples: list[Sample]) -> str:
    """Do Claude 3.5 → 3.7 → 4.5 → 4.6 → 4.7 walk a line in embedding space?
    Fit a 1D PCA on Claude mean vectors; see if the projected coordinate
    monotonically tracks version."""
    order = [
        "anthropic/claude-3.5-haiku",
        "anthropic/claude-3.7-sonnet",
        "anthropic/claude-haiku-4.5",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-opus-4.7",
    ]
    by_model = defaultdict(list)
    for s in samples:
        if s.model_id in order:
            by_model[s.model_id].append(s.vec)
    means = [by_model[mid] for mid in order]
    if any(len(m) == 0 for m in means):
        return "(missing data)"
    X = np.stack([l2n(np.mean(m, axis=0)) for m in means])
    # Center
    X_c = X - X.mean(axis=0, keepdims=True)
    u, s, vh = np.linalg.svd(X_c, full_matrices=False)
    coord = X_c @ vh[0]  # projection on first PC

    lines = ["| version | PC1 position | PC2 position |", "|---|---:|---:|"]
    pc2 = X_c @ vh[1]
    for mid, c, c2 in zip(order, coord, pc2):
        lines.append(f"| {mid} | {float(c):+.4f} | {float(c2):+.4f} |")

    monotone = all(coord[i] <= coord[i + 1] for i in range(len(coord) - 1)) or \
               all(coord[i] >= coord[i + 1] for i in range(len(coord) - 1))
    lines.append(f"\nMonotonic on PC1? **{'yes' if monotone else 'no'}**. "
                 f"Variance explained by PC1: {s[0]**2 / (s**2).sum():.1%}.")
    return "\n".join(lines)


def analysis_qwen_size(samples: list[Sample]) -> str:
    """Does Qwen parameter count trace a direction in embedding space?"""
    qwen_sizes = {
        "qwen/qwen-2.5-72b-instruct": 72,
        "qwen/qwen3-30b-a3b-instruct-2507": 30,
        "qwen/qwen3-235b-a22b-2507": 235,
        "qwen/qwen3-max": 600,  # unknown; use marker
    }
    by_model = defaultdict(list)
    for s in samples:
        if s.model_id in qwen_sizes:
            by_model[s.model_id].append(s.vec)
    if any(len(by_model[mid]) == 0 for mid in qwen_sizes):
        return "(missing qwen samples)"
    X = np.stack([l2n(np.mean(by_model[mid], axis=0)) for mid in qwen_sizes])
    X_c = X - X.mean(axis=0, keepdims=True)
    _, s, vh = np.linalg.svd(X_c, full_matrices=False)
    coord = X_c @ vh[0]

    lines = ["| model | approx params (B) | PC1 position |", "|---|---:|---:|"]
    for mid, c in zip(qwen_sizes, coord):
        lines.append(f"| {mid} | {qwen_sizes[mid]} | {float(c):+.4f} |")
    sizes = np.array(list(qwen_sizes.values()), dtype=float)
    corr = float(np.corrcoef(coord, sizes)[0, 1])
    lines.append(f"\nPC1 ↔ parameter-count Pearson r = **{corr:+.3f}**. "
                 f"PC1 variance explained: {s[0]**2 / (s**2).sum():.1%}.")
    return "\n".join(lines)


def analysis_volatility_ranking(samples: list[Sample], models: list[dict]) -> str:
    """Rank models by within-cell (same prompt, same temp) cosine spread at
    temp=1.0 — a direct measure of stochasticity."""
    meta = {m["id"]: m for m in models}
    by_cell: dict[tuple[str, str, float], list[np.ndarray]] = defaultdict(list)
    for s in samples:
        by_cell[(s.model_id, s.prompt_id, s.temperature)].append(s.vec)

    per_model: dict[str, list[float]] = defaultdict(list)
    for (mid, pid, t), vs in by_cell.items():
        if abs(t - 1.0) > 0.01 or len(vs) < 2:
            continue
        for i in range(len(vs)):
            for j in range(i + 1, len(vs)):
                per_model[mid].append(1 - float(np.dot(vs[i], vs[j])))

    rows = [(float(np.mean(v)), mid) for mid, v in per_model.items() if v]
    rows.sort()

    lines = ["**Top 5 most deterministic at temp=1.0:**\n",
             "| model | family | mean intra-cell distance |", "|---|---|---:|"]
    for dist, mid in rows[:5]:
        lines.append(f"| {mid} | {meta[mid]['family']} | {dist:.4f} |")
    lines += ["\n**Top 5 most stochastic at temp=1.0:**\n",
              "| model | family | mean intra-cell distance |", "|---|---|---:|"]
    for dist, mid in rows[-5:][::-1]:
        lines.append(f"| {mid} | {meta[mid]['family']} | {dist:.4f} |")

    # Is volatility family-correlated?
    fam_mean = defaultdict(list)
    for dist, mid in rows:
        fam_mean[meta[mid]['family']].append(dist)
    lines += ["\n**Mean volatility by family:**\n",
              "| family | mean intra-cell distance | n |", "|---|---:|---:|"]
    for fam, v in sorted(fam_mean.items(), key=lambda x: -np.mean(x[1])):
        lines.append(f"| {fam} | {float(np.mean(v)):.4f} | {len(v)} |")
    return "\n".join(lines)


def analysis_dimensional_signatures(samples: list[Sample], models: list[dict]) -> str:
    """Find the 10 embedding dimensions most discriminative between the two
    largest families (e.g. meta vs anthropic). Just the top-n-by-signal axes."""
    # Pick two large families with enough models
    fam_counts = defaultdict(int)
    for m in models:
        fam_counts[m["family"]] += 1
    big = sorted(fam_counts.items(), key=lambda x: -x[1])[:3]
    lines = [f"**Discriminative dimensions between {big[0][0]} and {big[1][0]}:**"]
    by_model = defaultdict(list)
    for s in samples:
        by_model[s.model_id].append(s.vec)
    model_mean = {m: np.mean(vs, axis=0) for m, vs in by_model.items()}

    def fam_matrix(family):
        ids = [m["id"] for m in models if m["family"] == family and m["id"] in model_mean]
        return np.stack([model_mean[mid] for mid in ids])

    A = fam_matrix(big[0][0])
    B = fam_matrix(big[1][0])
    # Per-dim: |mean_A - mean_B| / (std_A + std_B + eps)  — Fisher-like ratio
    mu_A, mu_B = A.mean(axis=0), B.mean(axis=0)
    s_A, s_B = A.std(axis=0) + 1e-9, B.std(axis=0) + 1e-9
    score = np.abs(mu_A - mu_B) / (s_A + s_B)
    top = np.argsort(-score)[:10]

    lines += [
        f"\nTop-10 dimensions by Fisher-like ratio |μ_A − μ_B| / (σ_A + σ_B):\n",
        "| dim | μ(" + big[0][0] + ") | μ(" + big[1][0] + ") | Fisher ratio |",
        "|---:|---:|---:|---:|",
    ]
    for d in top:
        lines.append(f"| {int(d)} | {mu_A[d]:+.4f} | {mu_B[d]:+.4f} | {score[d]:.2f} |")
    return "\n".join(lines)


# ============================================================================
# Main
# ============================================================================

def main():
    print("Loading models...")
    models = load_models()
    print(f"  {len(models)} models")

    print("Loading prompts...")
    prompts = load_prompts()
    print(f"  {len(prompts)} prompts")

    print("Loading samples (this takes a moment — many small files)...")
    samples = load_samples(models)
    print(f"  {len(samples)} samples loaded.")

    sections: list[tuple[str, str]] = []

    def add(title: str, fn):
        print(f"  running: {title}")
        try:
            out = fn()
        except Exception as e:
            out = f"(error: {e})"
        sections.append((title, out))

    add("1. Lineage gravity — base vs provider vs community fine-tunes",
        lambda: analysis_lineage_gravity(samples, models))
    add("2. Secret-same-model detector — unusually high cross-provider similarity",
        lambda: analysis_secret_same_model(samples))
    add("3. Which prompts separate or collapse models",
        lambda: analysis_prompt_discrimination(samples, prompts))
    add("4. Google anti-clustering — diagnosis",
        lambda: analysis_google_diagnosis(samples, models))
    add("5. Temperature-spread directions — is there a 'freedom axis'?",
        lambda: analysis_temperature_direction(samples, models))
    add("6. Claude generational axis — do versions walk a line?",
        lambda: analysis_anthropic_generational(samples))
    add("7. Qwen parameter-count direction",
        lambda: analysis_qwen_size(samples))
    add("8. Prompt-category discrimination ranking",
        lambda: analysis_prompt_category_collapse(samples, prompts))
    add("9. Cross-family voice siblings (who sounds like whom across provider lines)",
        lambda: analysis_voice_siblings(samples, models))
    add("10. Refusal-shape clustering — do edge prompts tighten family cohesion?",
        lambda: analysis_refusal_shape(samples, models))
    add("11. Volatility ranking — most/least stochastic at temp=1.0",
        lambda: analysis_volatility_ranking(samples, models))
    add("12. Discriminative embedding dimensions",
        lambda: analysis_dimensional_signatures(samples, models))

    header = [
        "# llmgarden — latent-space deep dive\n",
        f"*{len(samples):,} samples, {len(models)} models, {len(prompts)} prompts, "
        f"temp ∈ {{0.2, 0.7, 1.0}}*\n\n",
        "Each of the following is a standalone probe of the corpus designed to "
        "uncover structure that isn't visible from the headline scatter. All "
        "numbers come from the actual on-disk embeddings.\n\n",
        "---\n\n",
    ]
    body = []
    for title, out in sections:
        body.append(f"## {title}\n\n{out}\n\n---\n\n")

    REPORT.write_text("".join(header) + "".join(body))
    print(f"\nWrote {REPORT} ({REPORT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
