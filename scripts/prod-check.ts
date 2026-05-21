import { validateServerConfig } from "../server/env";

try {
  const config = validateServerConfig();
  console.log(JSON.stringify({ ok: true, config }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
