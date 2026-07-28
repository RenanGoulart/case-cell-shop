import { copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".env")) {
  if (!existsSync(".env.example")) {
    console.error("Missing .env and .env.example. Create .env before starting the stack.");
    process.exit(1);
  }

  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example.");
}

const result = spawnSync("docker", ["compose", "up", "--build", "--wait"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
