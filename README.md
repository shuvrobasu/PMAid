# PMAID — PM AI Aid™

> **Decision clarity before delivery.**

PMAID helps Technical Programme Managers decide whether AI is appropriate for a problem — and when it is, turns that decision into a governed, EU AI Act-aware delivery plan.

---

## The problem PMAID solves

A PM gets handed *"we need AI for this"* in a steering committee. They know Scrum. They know stakeholder management. What they do not know:

- Is AI even the right answer here?
- What type of AI applies?
- What does the EU AI Act say about what we are about to build?
- How is testing different when output is probabilistic?
- What does hypercare look like when models drift?

Every tool in the market either manages a project you have already planned, or proves compliance for an AI system you have already built. **Nothing helps you design the process before either of those happens.**

PMAID fills that gap.

<img width="1036" height="864" alt="image" src="https://github.com/user-attachments/assets/26044428-ebd7-4990-8b76-72e71c9ae5c9" />


---

## What PMAID is — and is not

| It is | It is not |
|---|---|
| A thinking partner for AI delivery decisions | A task tracker or Jira replacement |
| A process framework generator | An AI/ML learning platform |
| An EU AI Act screening tool | A compliance certification tool |
| A configurable delivery planner | A one-size-fits-all template |
| Fully local — nothing leaves your machine | Cloud-dependent or API-reliant |

---

## Key features

### Decision engine
- **Deterministic rule engine** — not an LLM — produces every recommendation. All rules live in YAML and are readable, editable, and auditable.
- **Four verdict states:** AI recommended / AI not recommended / No clear match / Prohibited hard stop
- **Confidence banding:** below 40 = NO\_MATCH regardless of rule match; 40–59 = amber warning; 60+ = normal recommendation
- **Visible reasoning:** every verdict shows why it matched and which rule fired — defensible in a steerco

### EU AI Act screening
- Classifies every project as Prohibited, High Risk, Limited Risk, or Minimal Risk
- High-risk projects automatically surface all eight mandatory compliance work packages
- Prohibited cases hard-stop — no plan is generated
- Results are presented as planning guidance, not legal advice

### Six-step Discovery Wizard
1. Business Problem
2. Success Definition
3. Data State
4. Organisational Readiness
5. EU AI Act Screen
6. Delivery Methodology

### Planner
- Eight configurable delivery phases: Problem Framing → Data Discovery → Solution Architecture → Data Engineering → Model Development → Validation → Deployment → Hypercare
- Every phase contains tasks, gates, roles, risks, and question-back items
- Assumption register and stakeholder map built in
- Phase, task, and gate status tracking

### Visualisations (four views)
- Process Flow
- Editable Timeline (drag phase bars to adjust duration)
- Risk Heat Map with adjacent risk register
- Editable RACI Matrix with configurable owner names

### Exports
- Project Charter
- Risk Register
- RACI Matrix
- Question-Back List
- Sponsor Summary (requires Local AI)

### Local AI layer (optional)
Uses **llama.cpp only** — no Ollama, no external APIs. Three features:
- **Problem Intake Assist** — plain-language description pre-fills wizard answers
- **Sponsor Summary** — concise sponsor-oriented project summary
- **Devil's Advocate** — identifies up to five areas the plan may have missed

All AI features disappear cleanly when llama.cpp is unavailable. The tool is 100% functional without it.

### Two operating modes
| Mode | When | Storage |
|---|---|---|
| Server mode | `python server.py` is running | SQLite (`data/pmaid.db`) |
| Browser-only mode | No server detected (2-second timeout) | localStorage |

Browser-only mode activates automatically. A persistent banner notifies the user. No configuration required.

---

## Quickstart

### Requirements
- Python 3.9 or later
- A modern browser (Chrome, Firefox, Edge)
- Optional: llama.cpp server + a GGUF model for AI features

### Run with Python server (recommended)

```bash
git clone https://github.com/your-username/pmaid.git
cd pmaid
python server.py
```

Open [http://localhost:8000/pages/splash.html](http://localhost:8000/pages/splash.html)

### Run without Python (browser-only)

Open `pages/splash.html` directly in your browser. Projects are saved in localStorage only.

### Stop the server

```bash
python stop_server.py
```

### Validate configuration

```bash
python config_validator.py
```

### Run acceptance tests

```bash
python prism_test.py
```

All 28 checks must pass before any deployment.

---

## Configuration

All content lives in YAML. No strings that a PM would want to edit are hardcoded in Python or JavaScript.

```
config/
└── master/
    ├── problem_types.yaml
    ├── ai_patterns.yaml
    ├── methodologies.yaml
    ├── phases.yaml
    ├── tasks.yaml
    ├── roles.yaml
    ├── risks.yaml
    ├── gates.yaml
    ├── rules.yaml
    ├── guidance.yaml
    ├── eu_ai_act.yaml
    └── ui.yaml
```

### Configuration layers (most specific wins)

1. Master YAML — shipped defaults
2. Organisation bundle — importable/exportable via Config Centre
3. Browser settings — admin overrides via Config Centre
4. Project overrides — per-project edits

### Rule validation

`config_validator.py` enforces at startup:
- Every rule must have at least 2 conditions
- Rules with confidence > 70 must include warnings
- Rules with confidence > 60 must include an evidence statement
- Duplicate condition sets are reported by rule ID

### Local AI configuration

In `config/master/ui.yaml`:

```yaml
local_ai:
  enabled: true
  endpoint: http://localhost:8080/completion
  model: local
  timeout_seconds: 30
  server_path: /path/to/llama-server
  model_path: /path/to/model.gguf
```

Set `enabled: false` to disable all AI features. The tool remains fully functional.

---

## Project structure

```
pmaid/
├── server.py                  # Start PMAID and llama.cpp
├── stop_server.py             # Stop both services
├── config_validator.py        # Validate YAML, write JSON cache
├── prism_test.py              # 28 acceptance checks
├── test_rules.py              # 10 rule scenario tests + EU tier tests
├── config/
│   ├── master/                # Source YAML (edit here)
│   └── cache/                 # Generated JSON (committed for browser-only mode)
├── static/
│   ├── css/
│   └── js/
│       ├── core/              # config-manager, state-manager, rule-engine
│       ├── modules/           # wizard, process-builder, export, local-ai
│       └── viz/               # flow-diagram, timeline, heatmap, raci-grid
├── pages/
│   ├── splash.html
│   ├── index.html
│   ├── discovery.html
│   ├── verdict.html
│   ├── planner.html
│   ├── visualizer.html
│   ├── export.html
│   ├── config.html
│   ├── rules.html
│   └── help.html
├── templates/                 # HTML export templates
└── data/                      # SQLite database (gitignored)
```

---

## Sample projects

Three projects are seeded on first run:

| Project | AI Type | EU AI Act Tier |
|---|---|---|
| Customer churn prediction | Supervised ML | High Risk |
| Document extraction | Document extraction | Limited Risk |
| Process automation | NOT\_AI | Minimal Risk |

Sample projects are protected from deletion.

---

## Design principles

- **Determinism over cleverness** — recommendations are traceable and auditable, not algorithmically convenient
- **Config over code** — all content in YAML; non-developer maintainable
- **Lean by design** — no task tracker features, no external APIs, no framework dependencies
- **Honest uncertainty** — low-confidence matches surface warnings, not confident wrong answers
- **Graceful degradation** — browser-only mode and no-AI mode both work without notification or error

---

## Licence

Licensed under the [PMAID Community Licence 1.0](LICENSE).
Free to use. Not free to copy, modify, or republish.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

*PMAID · PM AI Aid™ · © Shuvro Basu, 2026. All Rights Reserved.*
