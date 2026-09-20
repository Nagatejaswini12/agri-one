# External Data Sources

No module may fabricate live data. If a source below is unconfigured or
fails, the module must return/render an "unavailable" state.

| Module | Source | Notes |
|---|---|---|
| Weather | Open-Meteo (default, no key) or OpenWeatherMap (keyed) | IMD data used if/when freely accessible; "current" means the source's latest reading, not guaranteed real-time. |
| Market | AGMARKNET via data.gov.in | Requires a free data.gov.in API key. Publishes with lag (often 1+ day) — UI must show the as-of date, current-price only, no trend charts. |
| Soil | Farmer-entered values / Soil Health Card upload | No public API; this is inherently real because it's farmer-provided. |
| Pest | Pest/disease knowledge base + regional advisories where available | Falls back to general seasonal guidance, clearly labeled as such if no live regional alert exists. |
| Government Schemes | myscheme.gov.in / state agri department pages | No unified API — curated via a scheduled n8n refresh job, each entry timestamped and source-linked, not generated per-request. |
| Crop Diagnosis | Roboflow Serverless Hosted API, model `crop-disease-axhjj/1` | Only runs on farmer-uploaded images; low-confidence, empty, unsupported, or ambiguous results return `category: "inconclusive"`, never a guessed label. **Prototype scope**: 9 classes, tomato-focused — not comprehensive crop coverage, and not a guaranteed agricultural diagnosis. |
| Translation / Voice | Bhashini (Govt. of India) preferred; Google Cloud Translation/Speech as fallback | Needed for Tamil/Telugu/Hindi quality; vendor decision required before Phase 6. |
| Buyers | No known open verified dataset | Requires manual curation or a partner feed — flagged as the largest data-availability risk. |

All API keys live in `.env` files (see `.env.example` at the repo root
and in `services/n8n/`), never committed, never referenced from
`apps/web` directly.
