import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRaimondFieldProfilePatch } from "../src/raimondTools";

test("Raimond field edit normalizes spoken nitrogen price aliases", () => {
  assert.deepEqual(normalizeRaimondFieldProfilePatch({ priceOfNitrogen: "72 cents", fieldName: "Ridge 92" }), {
    fieldName: "Ridge 92",
    nitrogenPricePerLb: 0.72
  });
  assert.equal(normalizeRaimondFieldProfilePatch({ nitrogenCostPerPound: "$0.81" }).nitrogenPricePerLb, 0.81);
});
