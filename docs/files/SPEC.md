# SoilProve MVP — Agent-Executable Product Spec

**Version:** 1.0.0
**Status:** Ready for Ralph Wiggum Loop execution
**Methodology:** Red-Green-Refactor TDD inside an outer Ralph loop
**Owner:** Daniel Green
**Source of truth:** This file. If reality and this file disagree, update this file first, then code.

---

## 0. How an AI agent uses this document

This spec is the **single input** to a Ralph Wiggum loop. The agent reads the whole file every iteration and decides one thing: *what is the next failing test, and how do I make it pass?*

### 0.1 The Ralph Wiggum loop (outer loop)

```bash
# Run this loop. Do not edit it.
while :; do
  cat SPEC.md PROGRESS.md | <your-agent-cli> --auto-approve
  # Agent must:
  #   1. Read SPEC.md and PROGRESS.md
  #   2. Find the next unchecked task in §13 Task Ledger
  #   3. Execute ONE Red-Green-Refactor cycle for that task
  #   4. Append a single log entry to PROGRESS.md
  #   5. Check the task box in this file if the cycle is complete
  #   6. Exit 0
done
```

Stopping condition for the outer loop: every checkbox in §13 is checked AND `make ci` exits 0 AND §14 Definition of Done is satisfied. When all three are true the agent writes `LOOP_COMPLETE` on the last line of PROGRESS.md and the operator kills the loop.

### 0.2 The Red-Green-Refactor cycle (inner loop, one per Ralph iteration)

| Step | Action | Exit criteria |
|---|---|---|
| Red | Write the smallest failing test that pins down the next behavior in §13. Run it. Confirm it fails for the *expected reason* (assertion failure, not import error). | Test fails with the message you predicted. |
| Green | Write the *least* code that makes the test pass. No extra features. No speculative generality. | All previously-green tests still green, new test now green. |
| Refactor | If and only if the green code has duplication, dead code, or a name that lies, clean it up. Tests stay green. | `make ci` exits 0. |

If any step takes more than one iteration of the Ralph loop, split the task in §13 into smaller subtasks first, then continue.

### 0.3 Rules the agent must never break

1. No task in §13 is implemented before its tests are written and red.
2. Never delete or weaken a test to make CI pass. If a test is wrong, fix the test in its own commit with a written justification in PROGRESS.md.
3. Never add a dependency not listed in §6. If you need one, stop, add it to §6 in its own iteration, then continue.
4. Never invent farmer data, soil data, or yield numbers. Use the fixtures in §11.
5. Never make a real OEM API call from a test. Use the fakes in §11.4.
6. Every iteration ends with a single commit. Commit message format: `<task-id>: <red|green|refactor>: <one-line summary>`.
7. If two consecutive iterations fail to advance a single checkbox, write `STUCK: <task-id>: <reason>` on the last line of PROGRESS.md and exit. The human will intervene.

---

## 1. Product summary

SoilProve generates field-specific corn nitrogen prescriptions for Iowa, Illinois, and Indiana farmers using the MRTN methodology, validates each prescription against peer-farm outcomes in the same county and soil type, exports a variable-rate file to the farmer's planter, and tracks per-acre savings versus the farmer's prior practice. The MVP serves a closed beta of 20 to 30 paid farms at 300 to 350 dollars per month, with a guaranteed minimum 10 dollar per acre cost savings by month 6 or prescriptions are adjusted at no cost if yields drop more than 2 percent versus baseline.

The MVP is **not** a research tool, not a multi-crop platform, not a multi-region platform, and not an in-season adjustment tool. Wheat, soybeans, regions outside IA/IL/IN, and mid-season re-prescriptions are out of scope for v1.0.

## 2. Problem the software solves

A farmer in the target segment has grid soil-test data, has yield-history maps, owns variable-rate-capable equipment, suspects over-application on some fields, and still applies a flat rate because the cost of a wrong cut is one bad yield year. The software closes that confidence gap by combining the MRTN model with peer outcomes from comparable fields, exposing the math, and tracking the result.

## 3. Users and their jobs

There are three user roles. The software has different views and permissions for each.

**Farmer.** Uploads soil tests, reviews prescriptions, exports VRT files, records yield outcomes after harvest, sees the savings dashboard. Cannot publish case studies or modify another farmer's data.

**Agronomist.** Co-signs prescriptions for one or more farmers, sees the same prescription view the farmer sees plus the underlying MRTN math, can add a written endorsement that appears on the farmer's prescription page. Cannot change prescription values directly; can only request changes that the farmer must approve.

**Admin.** SoilProve staff. Onboards farms, validates uploaded soil data, manages peer-cohort assignments, publishes case studies once outcome data clears a quality threshold. Has read access to every farm's data.

## 4. Core user journeys (the only journeys v1.0 supports)

### 4.1 Onboarding a new farm

A farmer signs up, an admin pairs them with their agronomist, the farmer uploads grid soil-test CSVs for one or more fields, admin validates the data, the system generates a baseline prescription for the upcoming season. Target time from signup to first prescription: 7 calendar days. Target hands-on admin time per farm: 2 to 4 hours.

### 4.2 Generating and exporting a prescription

For each field, the farmer selects the upcoming season, the system pulls current MRTN coefficients for the field's county and soil type, computes a zone-by-zone nitrogen rate, fetches a peer comparison summary, displays the math, the agronomist co-signs in the UI, the farmer downloads a VRT file in the OEM format their planter supports.

### 4.3 Recording outcomes and seeing savings

After harvest, the farmer uploads a yield map for each prescribed field. The system overlays applied rate by zone against yield by zone, computes total nitrogen savings in dollars per acre versus the farmer's prior flat-rate baseline, computes yield delta versus the farmer's three-year average, displays both on a single dashboard, and flags any field where yield dropped more than 2 percent so the guarantee logic can trigger.

## 5. Architecture (deliberately small)

This MVP is a monolith. One application, one database, one set of credentials. No microservices, no event bus, no separate ML service. The agent must resist any urge to split this into services. If the spec turns out to be wrong about that, the spec will be updated and the agent will be told to split it; until then, monolith.

Three layers:

**Layer A — Domain.** Pure functions and dataclasses. No I/O. Owns the MRTN computation, the peer-comparison computation, the savings computation, and the VRT-file generation logic. This layer must be testable with no database, no network, no filesystem. The agent will spend most of its time here.

**Layer B — Application.** Use-case orchestration. Coordinates the domain layer with the database and the OEM-export adapter. Every use case is a single function that takes a request dataclass and returns a response dataclass.

**Layer C — Interface.** HTTP handlers (FastAPI), CLI commands, and a thin web UI rendered server-side with Jinja templates. No SPA in v1.0. The web UI is for farmers and agronomists; the CLI is for admins.

Persistence is PostgreSQL accessed through SQLAlchemy 2.x with the imperative mapping style. Migrations are managed with Alembic. There is no ORM session lifecycle outside the application layer; the domain layer never imports SQLAlchemy.

## 6. Allowed dependencies

The agent may use only these libraries in v1.0. Adding to this list requires a separate Ralph iteration whose only change is editing this section.

| Purpose | Library | Pinned version |
|---|---|---|
| Web framework | fastapi | 0.115.* |
| ASGI server | uvicorn | 0.32.* |
| ORM | sqlalchemy | 2.0.* |
| Migrations | alembic | 1.13.* |
| Database driver | psycopg | 3.2.* |
| Templates | jinja2 | 3.1.* |
| Settings | pydantic-settings | 2.6.* |
| Validation | pydantic | 2.9.* |
| HTTP client (for OEM adapter) | httpx | 0.27.* |
| Test runner | pytest | 8.3.* |
| Test fixtures | pytest-asyncio | 0.24.* |
| Coverage | coverage | 7.6.* |
| Lint | ruff | 0.7.* |
| Type-check | mypy | 1.13.* |
| CLI | typer | 0.13.* |
| Datetime | (stdlib only) | — |

No pandas. No numpy. No scikit-learn. No ML libraries. The MRTN math is closed-form arithmetic on Python `Decimal` and `float` values; it does not need a dataframe library.

## 7. Domain model (canonical names; never rename without updating this section)

### 7.1 Aggregates and entities

`Farm`. Has an `id` (UUID), `name`, `owner_user_id`, `county`, `state` (one of `IA`, `IL`, `IN`), `total_acres` (Decimal, must be between 100 and 5000 inclusive), `created_at`.

`Field`. Belongs to a `Farm`. Has `id`, `farm_id`, `name`, `acres` (Decimal, must be > 0 and ≤ farm.total_acres), `soil_type` (free text but constrained to a controlled vocabulary in §7.3), `created_at`.

`SoilTest`. Belongs to a `Field`. Has `id`, `field_id`, `sampled_on` (date), `lab_name`, `zones` (a list of `SoilZone`), `created_at`. A field may have multiple soil tests over time; the most recent test before a target season is the one used.

`SoilZone`. Value object inside `SoilTest`. Has `zone_id` (string, unique within the test), `acres` (Decimal, > 0), `organic_matter_pct` (Decimal, 0–10), `ph` (Decimal, 4.5–8.5), `phosphorus_ppm` (int, 0–200), `potassium_ppm` (int, 0–800). The sum of all zone acres in a test must equal the field's acres to within 0.5 acres.

`Prescription`. Belongs to a `Field`. Has `id`, `field_id`, `season_year` (int, 2026 or later), `crop` (must be `corn` in v1.0), `corn_price_per_bushel` (Decimal, > 0), `nitrogen_price_per_lb` (Decimal, > 0), `zone_recommendations` (list of `ZoneRecommendation`), `mrtn_inputs` (audit blob, see §8.1), `peer_summary` (see §8.2), `agronomist_signoff` (optional, see §7.2), `status` (`draft`, `signed`, `exported`), `created_at`, `signed_at` (nullable), `exported_at` (nullable).

`ZoneRecommendation`. Value object inside `Prescription`. Has `zone_id` (matches a `SoilZone.zone_id`), `nitrogen_lbs_per_acre` (Decimal, 0–300), `confidence` (one of `high`, `medium`, `low`, see §8.1).

`AgronomistSignoff`. Has `agronomist_user_id`, `signed_at`, `note` (text, ≤ 1000 chars).

`YieldRecord`. Belongs to a `Field`. Has `id`, `field_id`, `harvested_on` (date), `zones` (list of `YieldZone`), `created_at`.

`YieldZone`. Value object. Has `zone_id`, `bushels_per_acre` (Decimal, ≥ 0).

`SavingsResult`. Belongs to a `Field` for a given `season_year`. Computed, not stored as authoritative; recomputed on demand. Has `field_id`, `season_year`, `baseline_nitrogen_lbs_per_acre` (Decimal), `applied_nitrogen_lbs_per_acre` (Decimal), `nitrogen_saved_lbs_per_acre` (Decimal), `dollars_saved_per_acre` (Decimal), `yield_delta_pct` (Decimal, signed), `guarantee_triggered` (bool, true if yield_delta_pct < -2.0).

### 7.2 User roles

`User`. Has `id`, `email`, `role` (one of `farmer`, `agronomist`, `admin`), `display_name`, `created_at`. A farmer may have at most one agronomist linked; an agronomist may serve up to 25 farmers in v1.0. Linkage is stored in `FarmerAgronomistLink(farmer_user_id, agronomist_user_id, established_at)`.

### 7.3 Controlled vocabularies

**State:** `IA`, `IL`, `IN`. Anything else is a validation error.

**Soil type:** one of `silty_clay_loam`, `silt_loam`, `clay_loam`, `loam`, `sandy_loam`, `sandy_clay_loam`. Anything else is a validation error. (Yes, this list is shorter than reality. v1.0 ships with what MRTN coefficients are loaded for.)

**OEM target:** `john_deere`, `case_ih`, `agco`. v1.0 ships VRT export for `john_deere` only and stubs the other two with a 501 response and a clear message.

**Crop:** `corn`. Anything else is rejected at the API boundary.

## 8. Core algorithms (each gets a dedicated test file)

### 8.1 MRTN recommendation per zone

**Input.** A `SoilZone`, the field's `county` and `state`, the `season_year`, the `corn_price_per_bushel`, the `nitrogen_price_per_lb`, the `previous_crop` (corn-on-corn or corn-after-soybean), and a `mrtn_coefficient_lookup` function that returns `(intercept, linear_coef, quadratic_coef)` for the given state, region, and rotation.

**Output.** A `ZoneRecommendation` with the nitrogen rate in pounds per acre and a confidence label.

**Computation.** MRTN models net return as a quadratic function of nitrogen rate. Net return per acre equals corn price times yield-response-to-N minus nitrogen price times N rate. The maximum return to nitrogen is where the derivative is zero, which gives N* = (corn_price × linear_coef − nitrogen_price) / (2 × corn_price × |quadratic_coef|), provided the quadratic coefficient is negative (diminishing returns). The result is clamped to the range 0 to 240 lbs/acre for corn-on-corn and 0 to 200 lbs/acre for corn-after-soybean.

The zone result is then adjusted by an organic-matter credit equal to 10 lbs N per acre for every 1.0 percentage point of organic matter above 3.0 percent, subtracted from N*. The credit is capped at 30 lbs/acre.

Confidence is `high` if the zone's organic matter is between 2.0 and 5.0, pH is between 5.8 and 7.2, and the soil-test sample date is within 36 months of the season start. Confidence is `low` if any one of those is outside its range. Otherwise confidence is `medium`.

The `mrtn_inputs` audit blob on the resulting `Prescription` contains, for each zone, the exact coefficient triple used, the corn and nitrogen prices used, the previous crop, the OM credit applied, the pre-clamp value, and the post-clamp value. This blob is what the agronomist sees when they ask "why this rate." Storing it is non-negotiable.

### 8.2 Peer comparison

**Input.** A `Field` (state, county, soil_type, acres), the proposed `ZoneRecommendation` list, and a `PeerCohortRepository` that returns historical prescription-outcome pairs from other farms.

**Output.** A `PeerSummary` containing the count of comparable fields (same state, same county, same soil_type, prior season), the median applied nitrogen rate across those comparable fields, the median yield achieved, the median savings per acre realized, and a `comparability_score` from 0 to 100.

**Computation.** A peer field is "comparable" if it has the same state and county, soil type matches, the prior season has both a prescription and a yield record, and the field's acres are within 50 percent of the target field's acres. The comparability score is 100 if at least 5 comparable fields exist with the same soil type; it drops by 10 for each missing comparable down to a floor of 30. If fewer than 3 comparables exist, the peer summary returns with `comparability_score = 0` and the UI shows "insufficient peer data" rather than misleading numbers.

### 8.3 VRT file export (John Deere only in v1.0)

**Input.** A `Prescription` with `status = signed`, and the field's zone polygons. (Zone polygons come from the soil-test upload; see §9.2.)

**Output.** A byte string in the John Deere shapefile-bundle format: a ZIP archive containing a `.shp`, `.shx`, `.dbf`, and `.prj` file. The DBF column for nitrogen rate is named `N_RATE_LBS` and contains the per-zone nitrogen recommendation rounded to the nearest whole pound.

**Constraint.** The agent must not invent the shapefile binary format. v1.0 uses the `pyshp` library — except `pyshp` is not in §6, so before this task starts, §6 must be amended in its own Ralph iteration to add `pyshp` version `2.3.*`. The agent must perform that amendment task first.

### 8.4 Savings calculation

**Input.** A `Field`, a `Prescription` for `season_year = Y`, a `YieldRecord` for the same season, a `baseline_nitrogen_lbs_per_acre` value (the farmer's prior flat-rate practice; supplied at onboarding), and the `nitrogen_price_per_lb` used in the prescription.

**Output.** A `SavingsResult`.

**Computation.** Applied nitrogen per acre is the acres-weighted average of the prescription's zone rates. Nitrogen saved per acre is `baseline − applied` (may be negative). Dollars saved per acre is `nitrogen_saved_per_acre × nitrogen_price_per_lb`. Yield delta percent is `(harvested_yield_avg − three_year_baseline_yield_avg) / three_year_baseline_yield_avg × 100`, where harvested_yield_avg is the acres-weighted average of the yield record. The three-year baseline yield is supplied at onboarding as a single number per field; v1.0 does not store historical yield maps. The guarantee triggers if yield delta is less than negative 2.0 percent.

## 9. External interfaces

### 9.1 HTTP API surface

All endpoints are JSON. All endpoints require authentication (a signed session cookie set on login). Authentication itself is the simplest possible thing that could work: email + password with bcrypt, session cookies signed with the app's secret key. No OAuth in v1.0. Password reset is a manual admin task.

Endpoints, grouped:

`POST /api/v1/auth/login` — body `{email, password}`. Returns `204` and sets the session cookie or `401`.

`POST /api/v1/auth/logout` — clears the session.

`GET /api/v1/me` — returns the current user.

`POST /api/v1/farms` — admin only. Creates a farm.

`GET /api/v1/farms/{farm_id}` — returns farm details for the authenticated user if they own it or are linked to it as agronomist or admin.

`POST /api/v1/farms/{farm_id}/fields` — adds a field.

`POST /api/v1/fields/{field_id}/soil-tests` — multipart form upload of a soil-test CSV. Schema in §9.2.

`POST /api/v1/fields/{field_id}/prescriptions` — body `{season_year, corn_price_per_bushel, nitrogen_price_per_lb, previous_crop}`. Returns the draft prescription.

`POST /api/v1/prescriptions/{prescription_id}/signoff` — agronomist only. Body `{note}`. Transitions to `signed`.

`GET /api/v1/prescriptions/{prescription_id}/export?format=john_deere` — returns the VRT bundle as `application/zip`. Transitions to `exported`.

`POST /api/v1/fields/{field_id}/yield-records` — multipart form upload of a yield CSV. Schema in §9.2.

`GET /api/v1/fields/{field_id}/savings?season_year=Y` — returns the `SavingsResult`.

`GET /api/v1/farms/{farm_id}/dashboard` — returns aggregate savings across all fields for the most recent harvested season.

The minimal web UI rendered with Jinja exposes the same operations through forms.

### 9.2 Upload schemas

**Soil-test CSV.** Headers, exactly, in this order: `zone_id,acres,organic_matter_pct,ph,phosphorus_ppm,potassium_ppm,polygon_wkt`. One row per zone. `polygon_wkt` is the zone boundary as a WKT POLYGON. Any header mismatch, missing column, or out-of-range value rejects the entire file with a 422 and a per-row error list. Files are never partially imported.

**Yield CSV.** Headers, exactly, in this order: `zone_id,bushels_per_acre`. The `zone_id` values must match an existing soil test for the same field within the last 36 months, otherwise reject.

### 9.3 OEM export adapter

A single Python protocol, `OEMExporter`, with one method: `export(prescription, polygons) -> bytes`. v1.0 ships exactly one implementation, `JohnDeereShapefileExporter`. The other two named OEMs in §7.3 are registered with a `NotImplementedExporter` that raises a domain exception which the API layer converts to a 501 with the message "OEM target not yet supported; v1.0 ships John Deere only."

## 10. Non-functional requirements

**Performance.** Prescription generation for one field with up to 50 zones must complete in under 1 second on a developer laptop. VRT export for the same field must complete in under 2 seconds. The dashboard for a farm with up to 30 fields must render in under 3 seconds.

**Data integrity.** Every transition of `Prescription.status` is recorded with a timestamp. No prescription is mutable once `status = exported`. No yield record is mutable once created; corrections require an admin-only soft-delete and re-upload.

**Auditability.** The `mrtn_inputs` blob in §8.1 is required on every signed prescription. Without it, sign-off fails.

**Privacy.** Farm data belongs to the farmer. The peer-comparison feature uses only median values across cohorts of 5 or more; no single farm's data is ever exposed to another farm. This rule is enforced in the domain layer, not just the UI.

**Backups.** Nightly Postgres dump to S3 with 30-day retention. Out of scope for the application code; the agent is responsible only for ensuring the schema is dump-friendly (no extension dependencies outside `pgcrypto`).

## 11. Test strategy

Tests live in `tests/`. The directory layout mirrors the application layout exactly: a module at `soilprove/domain/mrtn.py` has its tests at `tests/domain/test_mrtn.py`.

### 11.1 Test pyramid for v1.0

| Layer | Count target | Speed budget |
|---|---|---|
| Unit (domain pure functions) | 80 to 120 tests | full suite under 2 seconds |
| Integration (application + database) | 30 to 50 tests | full suite under 30 seconds |
| API (full stack with TestClient) | 20 to 30 tests | full suite under 60 seconds |
| End-to-end (Playwright against the web UI) | 5 tests, one per user journey in §4 | full suite under 5 minutes |

If any band exceeds its budget by more than 20 percent, the agent stops feature work and opens a refactor task.

### 11.2 The "Red" half of Red-Green: how to write a failing test

Every test starts with a docstring naming the §13 task ID it belongs to. Every test uses one and only one assertion at the boundary it is testing; helper assertions inside the act phase are forbidden. Every test has an `arrange`, `act`, `assert` comment trio.

Example template:

```python
def test_T08_mrtn_corn_on_corn_clamps_at_240_lbs():
    """T08: MRTN recommendation for corn-on-corn must clamp to 240 lbs/acre maximum."""
    # arrange
    zone = soil_zone(organic_matter_pct="2.5", ph="6.5")
    coefs = (intercept=Decimal("250"), linear=Decimal("1.5"), quadratic=Decimal("-0.0001"))
    # act
    rec = recommend_nitrogen(zone, coefs, corn_price="4.50", n_price="0.65", previous_crop="corn")
    # assert
    assert rec.nitrogen_lbs_per_acre == Decimal("240")
```

### 11.3 Property-based tests (limited use)

For the MRTN clamp logic, the peer-cohort comparability score, and the acres-weighted averages in §8.4, write `hypothesis`-style property tests. (Hypothesis must be added to §6 before these tests are written; that's a §13 prerequisite task.)

### 11.4 Fakes and fixtures

`tests/fixtures/mrtn_coefficients.json` contains the canonical coefficient table used in tests. The agent must not invent additional coefficient values; new test cases use combinations of these fixtures.

`tests/fixtures/farms/`. Five canonical farms, named `mark_story_county`, `waverly_butler_county`, `caspian_boone_county`, `dorian_polk_county`, `beckett_dallas_county`, each with two fields, soil tests, and yield records for two seasons. These names match the personas in the source pack and exist to make tests readable, not as marketing.

`tests/fakes/oem_exporter.py` contains an in-memory `FakeJohnDeereExporter` that returns a deterministic byte string of the form `b"VRT_FAKE:" + json.dumps(zones, sort_keys=True).encode()`. The real `JohnDeereShapefileExporter` is tested separately with a small set of byte-level snapshot tests under `tests/integration/test_jd_shapefile.py`.

## 12. Repository layout

```
soilprove/
  pyproject.toml
  Makefile
  SPEC.md                    # this file
  PROGRESS.md                # append-only Ralph log
  alembic.ini
  alembic/versions/
  src/soilprove/
    __init__.py
    domain/                  # Layer A: pure
      __init__.py
      ids.py                 # UUID factories
      soil.py                # SoilZone, SoilTest
      prescriptions.py       # Prescription, ZoneRecommendation
      mrtn.py                # §8.1
      peers.py               # §8.2
      savings.py             # §8.4
      vrt.py                 # OEMExporter protocol
    application/             # Layer B: use cases
      __init__.py
      onboarding.py
      prescribe.py
      signoff.py
      export.py
      record_yield.py
      dashboard.py
    infrastructure/
      __init__.py
      db.py                  # SQLAlchemy engine + session
      models.py              # ORM mappings
      repositories.py        # one repo per aggregate
      jd_shapefile.py        # JohnDeereShapefileExporter
    interface/
      __init__.py
      http/
        __init__.py
        app.py               # FastAPI app factory
        routers/
          auth.py
          farms.py
          fields.py
          prescriptions.py
          yields.py
          dashboard.py
        templates/           # Jinja2
      cli/
        __init__.py
        admin.py             # typer CLI
  tests/
    conftest.py
    fixtures/
    fakes/
    domain/
    application/
    integration/
    api/
    e2e/
```

## 13. Task ledger (the only source of truth for "what's next")

Each task is a single Red-Green-Refactor cycle. Tasks are ordered. **The agent must work them top to bottom, one per Ralph iteration.** No task may begin before its dependencies are checked off.

Notation: `[ ]` = not done, `[x]` = done, `[~]` = in progress (only one task may be in-progress at a time; if the agent crashes mid-task, the next iteration resumes that task).

### Phase 0 — Scaffolding

- [ ] **T00.** Initialize repo: `pyproject.toml` with §6 dependencies pinned, `Makefile` with `make install`, `make test`, `make lint`, `make typecheck`, `make ci` (runs all three), `make run` (uvicorn). Test for this task: `make ci` must exit 0 against an empty `src/soilprove/__init__.py`.
- [ ] **T01.** Add `conftest.py` that loads `tests/fixtures/mrtn_coefficients.json` and exposes it as a session-scoped fixture `mrtn_coefs`. Test: a trivial test importing the fixture passes.
- [ ] **T02.** Create the five fixture farms under `tests/fixtures/farms/` as JSON. Each farm includes two fields, one soil test per field with three zones, and one yield record per field for season 2025. Test: a fixture-loader function returns each farm with valid soil-zone-acres totals.

### Phase 1 — Domain: MRTN

- [ ] **T03.** Define dataclasses for `SoilZone`, `SoilTest`, `ZoneRecommendation`, `Prescription` (without persistence). Tests cover construction and validation per §7.1.
- [ ] **T04.** Write the validation: zone acres sum to field acres within 0.5; soil_type is in the controlled vocabulary; state is in `{IA, IL, IN}`. Tests cover the happy path and three rejection cases.
- [ ] **T05.** Implement `recommend_nitrogen(zone, coefs, corn_price, n_price, previous_crop)` returning `ZoneRecommendation` with no OM credit and no clamping yet. Test against three fixture coefficient triples with known answers computed by hand.
- [ ] **T06.** Add the organic-matter credit (10 lbs N per 1 percentage point of OM above 3.0, capped at 30). Tests cover OM = 2.0 (no credit), OM = 3.5 (5 lb credit), OM = 6.0 (30 lb cap).
- [ ] **T07.** Add the clamp at 0 for the floor. Test: a high-N-price, low-corn-price input produces a clamped 0.
- [ ] **T08.** Add the clamp at 240 for corn-on-corn and 200 for corn-after-soybean. Two tests, one each.
- [ ] **T09.** Add confidence labeling per §8.1. Tests cover one `high`, one `medium`, one `low` case.
- [ ] **T10.** Build and persist the `mrtn_inputs` audit blob on the resulting prescription. Test: every field of the blob is present and matches the inputs that produced the rate.

### Phase 2 — Domain: peer comparison

- [ ] **T11.** Define `PeerSummary` and the `PeerCohortRepository` protocol. Test: protocol can be implemented by a fake returning a fixed list.
- [ ] **T12.** Implement `summarize_peers(field, recommendations, repo)` returning a `PeerSummary` with comparability score 100 when ≥ 5 comparables exist. Test against a fake repo with exactly 5 matching peers.
- [ ] **T13.** Implement the comparability decay: −10 per missing peer, floor at 30, zero below 3 peers. Three tests.
- [ ] **T14.** Implement the privacy rule: never return individual peer data, only medians. Test: the `PeerSummary` returned never references a single peer field's identity.

### Phase 3 — Domain: savings

- [ ] **T15.** Implement `compute_savings(field, prescription, yield_record, baseline_n, baseline_yield, n_price)` returning a `SavingsResult` per §8.4. Test against the `mark_story_county` fixture with the expected dollars/acre saved precomputed in the fixture file.
- [ ] **T16.** Add the guarantee-trigger flag for yield delta < −2 percent. One test that triggers, one that doesn't.

### Phase 4 — Infrastructure

- [ ] **T17.** Set up SQLAlchemy engine, sessionmaker, and `db.py`. Alembic baseline migration creates an empty schema. Test: `make ci` includes a smoke test that opens a session and runs `SELECT 1`.
- [ ] **T18.** ORM mappings and migrations for `User`, `Farm`, `Field`, `SoilTest`, `SoilZone`, `Prescription`, `ZoneRecommendation`, `YieldRecord`, `YieldZone`, `FarmerAgronomistLink`. Integration tests insert and read each.
- [ ] **T19.** Repository classes for each aggregate. Each method is a single SQL operation. Integration tests cover create/read/list per aggregate.

### Phase 5 — Application use cases

- [ ] **T20.** `onboard_farm(request)` use case. Integration test creates a farm + first field + first soil test from a fixture.
- [ ] **T21.** `generate_prescription(request)` use case. Integration test produces a draft prescription for a fixture field and verifies the mrtn_inputs blob is persisted.
- [ ] **T22.** `signoff_prescription(request)` use case. Test that an agronomist linked to the farmer succeeds; an unlinked agronomist gets a permission error; a farmer cannot self-sign.
- [ ] **T23.** `record_yield(request)` use case. Test that a yield CSV whose zones don't match the most recent soil test is rejected with a clear error.
- [ ] **T24.** `compute_dashboard(farm_id)` use case. Test aggregates two fields' savings into a farm total.

### Phase 6 — VRT export

- [ ] **T25.** Amend §6 to add `pyshp` 2.3.\*. This iteration changes only the spec; no code. Test: `make ci` still green.
- [ ] **T26.** Implement `JohnDeereShapefileExporter`. Integration test against a fixture prescription: produced ZIP contains `.shp`, `.shx`, `.dbf`, `.prj`; the DBF row count equals zone count; the `N_RATE_LBS` values match the prescription rounded to integers.
- [ ] **T27.** Register `NotImplementedExporter` for `case_ih` and `agco`. Test: requesting either returns a domain error.

### Phase 7 — HTTP API

- [ ] **T28.** FastAPI app factory and `/api/v1/auth/login`, `/logout`, `/me`. API tests cover login success, login failure, logout.
- [ ] **T29.** Farms and fields endpoints from §9.1. API tests cover create + read + permission checks.
- [ ] **T30.** Soil-test upload endpoint with CSV parsing per §9.2. API tests: happy path, missing header, out-of-range value, zone-acres mismatch.
- [ ] **T31.** Prescription endpoints (create draft, sign off, export). API tests cover the full prescription lifecycle.
- [ ] **T32.** Yield upload + savings endpoint. API tests cover happy path and the guarantee-triggered case.
- [ ] **T33.** Dashboard endpoint. One API test against a multi-field fixture.

### Phase 8 — Minimal web UI

- [ ] **T34.** Login page, farm list page, field detail page (Jinja templates only). One e2e test logs in and navigates to a field.
- [ ] **T35.** Prescription creation form and review page. One e2e test creates a draft prescription end to end.
- [ ] **T36.** Yield upload form and savings dashboard page. One e2e test uploads a yield CSV and sees the savings number.

### Phase 9 — Admin CLI

- [ ] **T37.** `soilprove admin create-farm`, `link-agronomist`, `validate-soil-test`. Each command has an integration test.

### Phase 10 — Cross-cutting

- [ ] **T38.** Logging: structured JSON logs to stdout, one record per request, request_id propagated. Test: a request produces exactly one log line with the expected keys.
- [ ] **T39.** Error handling: a single FastAPI exception handler converts domain exceptions to 4xx with consistent body shape `{error: {code, message, details}}`. Test the three most common domain exceptions.
- [ ] **T40.** Configuration via `pydantic-settings`. Test that missing required env vars fail at startup with a readable error.

### Phase 11 — Ship

- [ ] **T41.** Write `README.md` describing how to run the app locally and how to run the tests. Test: a clean clone followed by the steps in README produces a passing `make ci`.
- [ ] **T42.** Final acceptance pass against §14 Definition of Done. The iteration that checks this box writes `LOOP_COMPLETE` to PROGRESS.md.

## 14. Definition of Done for v1.0

All of the following must be true at the same time:

1. Every checkbox in §13 is checked.
2. `make ci` exits 0 with no warnings.
3. Coverage is at least 90 percent on `src/soilprove/domain/` and at least 75 percent overall.
4. Type-check passes with `mypy --strict` on `src/soilprove/domain/` and `--no-implicit-optional` on the rest.
5. The five e2e tests in §11.1 pass against a freshly migrated database.
6. The README walkthrough succeeds on a clean clone.
7. No `# TODO`, `# FIXME`, or `# XXX` comments remain in `src/`.
8. The `pyproject.toml` dependency list matches §6 exactly.

## 15. What this spec deliberately does not say

The spec does not specify a deployment target, a CI provider, an authentication provider, a payment processor, an email service, an analytics tool, a feature-flag system, a CDN, a cache, or a queue. All of those are out of scope for v1.0. When a future iteration needs any of them, the spec gets amended first and the Ralph loop continues.

The spec does not specify pricing-page UI, billing, contracts, or subscription management. The MVP collects payment outside the system; the application has no concept of money beyond the prescription's input prices and the savings result.

The spec does not specify a mobile app. The web UI is responsive enough; native mobile is a v2 conversation.

## 16. Glossary

**MRTN** — Maximum Return To Nitrogen, the corn-nitrogen recommendation methodology developed by the Corn Belt land-grant universities. SoilProve uses published state-level coefficients; it does not estimate new ones.

**VRT** — Variable Rate Technology. A planter or applicator that can change input rates by location across a field, driven by a prescription file.

**Zone** — A polygon within a field that shares a soil-test result. Zones come from grid sampling; SoilProve does not create or modify zone boundaries, it consumes them.

**Cohort** — The set of comparable peer fields used in the §8.2 computation for a given field.

**Guarantee trigger** — A computed flag indicating that a field's harvested yield fell more than 2 percent below its three-year baseline, which under the SoilProve offer requires SoilProve to adjust next season's prescription at no additional cost.

---

## Appendix A — Starter PROGRESS.md template

```
# Ralph Wiggum loop log

Each line is a single iteration. Format:
ISO_TIMESTAMP  TASK_ID  PHASE  RESULT  NOTE

Phases: red, green, refactor, spec-amend, blocked.
Result: pass, fail, skipped.

2026-05-20T00:00:00Z  T00  red       fail  initial scaffolding test added
```

## Appendix B — One-paragraph reminder before every iteration

Before each Ralph iteration the agent reads this paragraph and follows it. Pick the lowest unchecked task in §13. Write exactly one failing test for the next behavior in that task. Run the suite. If the test fails for the predicted reason, write the smallest code that makes it pass. Run the suite again. If green, refactor only what duplicates or lies. Run the suite a third time. Commit. Append one line to PROGRESS.md. Check the box in §13 if and only if the task is fully complete. Exit. Do not start the next task in the same iteration.
