# OEM Integration Feasibility

Checked May 20, 2026 against public OEM documentation.

## Bottom Line

SoilProve can ship a live-ready OEM integration layer tonight, but it cannot honestly promise production write-back to farmer equipment without OEM developer/app access, user authorization, and in some cases production promotion or routing setup.

Recommended demo stance:

- John Deere: primary polished path. Use real VRT shapefile ZIP and deterministic Operations Center simulation unless OAuth credentials, org access, and required scopes are present.
- Case IH/CNH: credential-gated FieldOps adapter. Keep it ready for staging/production credentials, but do not imply it is production live tonight.
- AGCO/agrirouter: credential/routing-gated message adapter. Keep simulation or credential-required state until endpoint, capability, tenant, and recipient route are configured.

## John Deere Operations Center

Source docs:

- [John Deere developer docs](https://developer.deere.com/dev-docs/machine-hours-of-operation)
- [John Deere API agreement](https://developer.deere.com/clickThroughAPIAgreement.html)
- [John Deere Data Services](https://www.deere.com/en/privacy-and-data/data-services/)
- [Operations Center connected partners](https://www.deere.com/en/technology-products/precision-ag-technology/operations-center/connected-partners/)

Useful facts:

- OAuth 2 authorization-code flow is required for external apps.
- A validated John Deere user creates an app in `developer.deere.com`.
- Users must connect their Operations Center organization to the application.
- Files API access requires the `files` scope; Deere docs note `ag3` is also required for most file types.
- The sandbox files endpoint pattern appears as `https://sandboxapi.deere.com/platform/organizations/{orgId}/files`.
- Deere's click-through agreement permits internal development/testing, but release to third-party customers requires a separate production agreement.

Feasibility without Deere approval:

- Internal demo/simulation: yes.
- Sandbox/internal API testing: possible if we have a validated Deere developer account, app credentials, and a consenting Operations Center user/org.
- Production customer write-back: no. It needs the customer org connection and the production/commercial permission path.

Implementation posture:

- Keep `JOHN_DEERE_ACCESS_TOKEN` + `JOHN_DEERE_ORG_ID` live path.
- Use deterministic simulation when missing credentials.
- Show response as `simulated`, not `credential_required`, because the app can validate the exact VRT bundle and file set locally.
- Label production as pending Deere/customer authorization.

Test guardrail and demo behavior:

- Normal test runs clear John Deere credential environment variables before OEM API checks.
- Tests block non-local fetches so there is no accidental live John Deere call when local credentials exist.
- Demo behavior without credentials is deterministic Operations Center simulation with `mode=simulated`, response ID, filename, DBF presence, and `N_RATE_LBS` messaging.
- Live behavior is allowed only when `JOHN_DEERE_ACCESS_TOKEN` and `JOHN_DEERE_ORG_ID` are intentionally present for a staging/operator run.

## Case IH / CNH FieldOps

Source docs:

- [CNH Developer Portal](https://develop.cnh.com/get-started/developer-portal)
- [CNH Get Started](https://develop.cnh.com/get-started)
- [CNH Send Prescription (Rx)](https://develop.cnh.com/api-guides/fieldops-api/rx-direct-to-vehicle)

Useful facts:

- CNH Developer Portal requires a company email domain and app setup.
- FieldOps API uses OAuth 2 authorization-code flow with client ID/secret, refresh/access tokens, environment URLs, and API-specific subscription keys.
- Production promotion happens after staging configuration/testing and issues new production credentials.
- FieldOps account access requires the user to be invited into the account, have Farm Manager title, and log into FieldOps at least once.
- Prescription send supports multipart form data with parameters like `companyId`, `VIN`, `fieldId`, `seasonId`, `activityTypeId`, `productId`, and `shapeFileAttributeName`.

Feasibility without CNH approval:

- Internal demo/simulation: yes.
- Staging test: possible after Developer Portal registration and app setup.
- Production customer delivery: no. It needs production credentials/promotion plus FieldOps account consent and permissions.

Implementation posture:

- Keep `CNH_ACCESS_TOKEN`, `CNH_COMPANY_ID`, `CNH_VEHICLE_ID` gated path.
- Add subscription-key/env support before a real staging test.
- Return `credential_required` until those are present.

Test guardrail and demo behavior:

- Normal test runs clear CNH credential environment variables before OEM API checks.
- Tests block non-local fetches so there is no accidental live Case IH / CNH call when local credentials exist.
- Demo behavior without credentials is explicit `credential_required` with missing variable names.
- Live behavior is allowed only when `CNH_ACCESS_TOKEN`, `CNH_COMPANY_ID`, `CNH_VEHICLE_ID`, and `CNH_SUBSCRIPTION_KEY` are intentionally present for a staging/operator run.

## AGCO / agrirouter

Source docs:

- [agrirouter Send Your First Message](https://agrirouter.com/en/docs/getting-started/send-your-first-message)
- [agrirouter message sending](https://docs.agrirouter.com/agrirouter-interface-documentation/latest/integration/message-sending.html)
- [agrirouter endpoint commands](https://docs.agrirouter.com/agrirouter-interface-documentation/latest/commands/endpoint.html)

Useful facts:

- agrirouter requires an active endpoint with configured capabilities.
- Sending requires a valid access token, endpoint ID, tenant ID, environment URLs, message type, recipient endpoint, and either direct or publish addressing.
- For ISOXML/TaskData ZIP payloads, the message type is commonly `iso:11783:-10:taskdata:zip`.
- Message delivery requires sender capability, recipient capability, and an account-owner-configured route.
- The docs explicitly state the application cannot create routes; the account owner configures them in agrirouter UI.
- A 200 only means agrirouter accepted the message for delivery; it does not confirm the recipient actually received it.

Feasibility without AGCO/agrirouter route setup:

- Internal demo/simulation: yes.
- Developer verification with IO-Tool receiver: possible with endpoint credentials and configured capabilities.
- Production delivery to equipment/software: no. It needs endpoint onboarding, recipient endpoint, and account-owner route/capability setup.

Implementation posture:

- Replace the current thin AGCO endpoint call with agrirouter headers/body when credentials are present:
  - `Authorization: Bearer ...` from `AGCO_ACCESS_TOKEN`
  - `Content-Type: application/octet-stream`
  - `x-agrirouter-endpoint-id`
  - `x-agrirouter-tenant-id`
  - `x-agrirouter-message-type`
  - `x-agrirouter-is-publish`
  - `x-agrirouter-direct-recipients`
  - `x-agrirouter-context-id`
  - `x-agrirouter-sent-timestamp`
- Return `credential_required` until endpoint, tenant, message type, and recipient/routing config are present.

Test guardrail and demo behavior:

- Normal test runs clear AGCO credential environment variables before OEM API checks.
- Tests block non-local fetches so there is no accidental live AGCO / agrirouter call when local credentials exist.
- Demo behavior without credentials is explicit `credential_required` with missing variable names.
- Live behavior is allowed only when `AGCO_ACCESS_TOKEN`, `AGCO_ENDPOINT_ID`, `AGCO_TENANT_ID`, and `AGCO_RECIPIENT_ID` are intentionally present and the account owner has configured recipient route/capabilities.

## What To Build Tonight

1. Real VRT ZIP remains the payload source of truth.
2. John Deere gets a first-class simulator and live path.
3. CNH and AGCO remain explicit credential/routing-gated adapters.
4. UI should show the integration mode: `live`, `simulated`, or `credential_required`.
5. Evals should fail if the app claims unauthenticated production delivery.
