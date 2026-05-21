import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Realtime smoke exercises hands-free Raimond tool actions with safe fallbacks", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "soilprove-realtime-smoke-"));
  try {
    const { stdout } = await execFileAsync("npx", ["tsx", "scripts/realtime-smoke.ts"], {
      env: { ...process.env, SOILPROVE_DATA_DIR: dataDir },
      maxBuffer: 1024 * 1024
    });
    const jsonStart = stdout.lastIndexOf("\n{");
    const result = JSON.parse(stdout.slice(jsonStart >= 0 ? jsonStart + 1 : stdout.indexOf("{"))) as {
      ok: boolean;
      actions: Array<{ name: string }>;
      guardrails: { actionCount: number; liveOemCallsBlocked: number };
      fallback: { noKeyCode: string; microphoneDenied: string };
    };

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.actions.map((action) => action.name),
      [
        "dismiss_onboarding",
        "navigate_workspace",
        "get_soilprove_state",
        "advance_demo_step",
        "load_sample_field",
        "import_sample_soil_report",
        "update_field_profile",
        "edit_field_value",
        "confirm_intake_review",
        "generate_prescription",
        "sign_prescription",
        "create_review_packet",
        "download_vrt",
        "send_to_oem",
        "upload_yield_results",
        "run_full_demo_setup",
        "reset_demo_flow"
      ]
    );
    assert.equal(result.guardrails.actionCount, 17);
    assert.equal(result.guardrails.liveOemCallsBlocked, 0);
    assert.equal(result.fallback.noKeyCode, "OPENAI_NOT_CONFIGURED");
    assert.match(result.fallback.microphoneDenied, /Microphone permission was denied/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
