import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "test:unit"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
