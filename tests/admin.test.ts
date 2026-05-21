import test from "node:test";
import assert from "node:assert/strict";
import { runAdminCommand } from "../scripts/admin";
import { listFarms, resetDatabaseForTests, saveUser } from "../server/db";

test.beforeEach(() => {
  resetDatabaseForTests();
});

test("admin CLI creates farms, links agronomists, and validates soil CSV", () => {
  saveUser({ id: "farmer-1", name: "Farmer", authMode: "demo", role: "farmer", planType: "test", createdAt: new Date().toISOString() });
  saveUser({ id: "agronomist-1", name: "Agronomist", authMode: "demo", role: "agronomist", planType: "test", createdAt: new Date().toISOString() });
  const created = runAdminCommand(["create-farm", "--id", "cli-farm", "--name", "CLI Farm", "--owner", "Farmer", "--state", "IA", "--county", "Story", "--acres", "80"]);
  const linked = runAdminCommand(["link-agronomist", "--farmer", "farmer-1", "--agronomist", "agronomist-1", "--farm", "cli-farm"]);
  const validated = runAdminCommand([
    "validate-soil-test",
    "--field-acres",
    "80",
    "--csv",
    [
      "zone_id,acres,organic_matter_pct,ph,phosphorus_ppm,potassium_ppm,polygon_wkt",
      "Z1,80,3.1,6.4,42,235,POLYGON((0 0,1 0,1 1,0 1,0 0))"
    ].join("\n")
  ]);

  assert.equal(created.ok && linked.ok && validated.ok, true);
  assert.equal(listFarms().some((farm) => farm.id === "cli-farm"), true);
});
