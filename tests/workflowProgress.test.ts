import assert from "node:assert/strict";
import test from "node:test";
import { workflowProgress } from "../src/App";

const active = { locked: false, reason: "", state: "active" as const };
const complete = { locked: false, reason: "", state: "complete" as const };
const locked = { locked: true, reason: "Complete the previous step first.", state: "locked" as const };
const ready = { locked: false, reason: "", state: "ready" as const };

test("workflow progress counts completed gates and not merely ready gates", () => {
  assert.deepEqual(
    workflowProgress({
      intake: active,
      plan: locked,
      proof: locked,
      packet: locked,
      exports: locked,
      results: locked
    }),
    { completed: 0, total: 6, percentComplete: 0 }
  );

  assert.deepEqual(
    workflowProgress({
      intake: complete,
      plan: ready,
      proof: locked,
      packet: locked,
      exports: locked,
      results: locked
    }),
    { completed: 1, total: 6, percentComplete: 17 }
  );

  assert.deepEqual(
    workflowProgress({
      intake: complete,
      plan: complete,
      proof: complete,
      packet: complete,
      exports: complete,
      results: complete
    }),
    { completed: 6, total: 6, percentComplete: 100 }
  );
});
