# Contributing to PMAID

PMAID is a local-first, dependency-free planning application. Keep contributions small, readable, and usable without a build step.

## Run locally

Requirements:

- Python 3.11 or later
- A modern browser
- Optional: `llama-server` from llama.cpp and a local GGUF model

From the project root:

```powershell
python server.py
```

Open `http://localhost:8000/pages/index.html`. Stop the background PMAID server with:

```powershell
python stop_server.py
```

## Validate changes

Run the configuration parser first, then the rule and acceptance checks:

```powershell
python config_validator.py config
python test_rules.py
python pmaid_test.py
```

The test scripts use the Python standard library. Do not add a JavaScript or Python test framework just for this project.

## Architecture

- `server.py` serves static files, keeps the generated cache current, persists projects to SQLite, and exposes the project and organisation-config APIs.
- `pages/` contains browser screens.
- `static/js/core/` contains storage, configuration, and project-state services.
- `static/js/modules/` contains the rule, planning, export, and Local AI features.
- `static/js/viz/` contains the four native browser visualisations.
- `config/master/` contains source YAML.
- `config/cache/` is generated JSON consumed by the browser.
- `config/org/bundle.json` is the optional organisation override layer.
- `data/pmaid.db` contains server-mode projects and their version history.

On startup, `server.py` runs configuration validation and regenerates `config/cache/` only when a cache file is missing or its source YAML is newer. The committed cache lets the application run from a plain static host without first running Python validation.

## Configuration layers

PMAID merges configuration in this order, with later layers taking precedence:

1. Master YAML in `config/master/`
2. Shared organisation bundle in `config/org/bundle.json`
3. Browser-only admin settings in localStorage
4. Project-specific overrides stored with the project

The guided task, role, and risk editors save to the organisation bundle. Local AI paths, custom phases, and current decision-rule overrides are browser-only. Importing either backup does not modify master YAML or projects.

Do not edit files in `config/cache/` directly. Run `python config_validator.py config` after changing master YAML.

## Supported YAML

`config_validator.py` intentionally implements a small YAML subset:

- indentation-based maps and lists
- strings, integers, decimals, booleans, `null`, `[]`, and `{}`
- no anchors, aliases, tags, folded blocks, or inline collections other than empty ones

Keep each list item and branch on its own line. Quote a value when it could be interpreted as a number, boolean, or null.

## Main configuration schemas

Tasks in `tasks.yaml`:

```yaml
tasks:
  - task_id: t_example
    name: Example task
    description: Plain-English delivery action
    phase: problem_framing
    complexity: Medium
```

Roles in `roles.yaml`:

```yaml
roles:
  - role_id: r_example
    name: Example Role
    description: What this role owns
    raci_default: C
```

The organisation editor may add a `phases` list to a role so it can maintain phase membership without raw JSON editing.

Risks in `risks.yaml`:

```yaml
risks:
  - risk_id: risk_example
    title: Example risk
    description: What may happen and why it matters
    category: delivery
    default_likelihood: 3
    default_impact: 4
    phases:
      - problem_framing
```

Phases reference task, role, risk, and gate IDs through `default_tasks`, `default_roles`, `default_risks`, and `default_gates`. The guided organisation editors update these references automatically.

Rules in `rules.yaml` are evaluated by descending priority. Each rule contains at least two `conditions`, an `output`, and a stable `rule_id`. Confidence below 40 produces `NO_MATCH`, confidence from 40 to 59 produces a limited-signal warning, and confidence of 60 or above is shown normally. A prohibited EU result is a hard stop and must never create a plan.

Every rule should include one plain-English `evidence` sentence. The validator hard-stops when a rule has fewer than two conditions or confidence above 70 without warnings. It warns and continues when confidence above 60 lacks evidence or when two rules have identical condition sets. Keep each rule ID unique so the verdict's matched-rule reference remains traceable.

## Project data

Projects embed their generated phases, risks, RACI matrix, assumption register, stakeholder map, question-back list, NOT-AI mini-plan when relevant, and Discovery version history. Existing projects keep their embedded plan until Discovery is rerun or the planner reload action is used.

At load, the configuration manager gives `/api/projects` two seconds to respond. A successful response selects server mode and SQLite storage. Failure selects browser-only mode, loads committed JSON from `config/cache/`, stores projects in localStorage, and avoids further `/api/` calls. llama.cpp availability is independent of this storage mode.

## Coding guidelines

- Use browser APIs and the Python standard library before adding code or dependencies.
- Keep Local AI optional and limited to llama.cpp's `/completion` endpoint.
- Never send project data to an external API.
- Preserve graceful degradation when llama.cpp is unavailable.
- Use explicit branches. Avoid inline conditionals and compound statements.
- Keep rule explanations and warnings in plain English.
- Do not silently change a master configuration contract; document it here and in `CHANGELOG.md`.

## Pull requests

Describe the user-visible outcome, the configuration or data migration impact, and the checks run. Include screenshots for visual changes and add a dated entry under `Unreleased` in `CHANGELOG.md`.
