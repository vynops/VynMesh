#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--production")) throw new Error("Usage: npm run setup [-- --production]");

const production = args.includes("--production");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) {
  console.error("Node.js 22 or newer is required. Install Node.js 22+ and run setup again.");
  process.exit(1);
}

const envFile = path.join(root, production ? ".env.production" : ".env.local");
const envFileExists = existsSync(envFile);
let env = envFileExists ? readFileSync(envFile, "utf8") : "";
const keyLine = `CONNECTOR_CONFIG_KEY=${randomBytes(32).toString("hex")}`;
const keyMatch = env.match(/^\s*CONNECTOR_CONFIG_KEY\s*=\s*(.*)$/m);

if (keyMatch?.[1].trim()) {
  console.log(`Keeping the existing connector key in ${path.basename(envFile)}.`);
} else {
  if (keyMatch) {
    env = env.replace(keyMatch[0], keyLine);
  } else {
    env = `${env}${env && !env.endsWith("\n") ? "\n" : ""}${keyLine}\n`;
  }
  writeFileSync(envFile, env, { encoding: "utf8", mode: 0o600 });
  console.log(`Generated a private connector key in ${path.basename(envFile)}.`);
}

function runNpm(commandArgs) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", commandArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`Could not run npm: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNpm(["ci"]);
if (production) runNpm(["run", "build"]);

console.log(`First login: admin@vynmesh.local / changeme. You must set a new password of at least 12 characters.`);
if (production) {
  console.log("The production server will listen on 127.0.0.1:3090. Keep it private until the initial password is changed.");
  runNpm(["run", "start", "--", "--hostname", "127.0.0.1"]);
} else {
  console.log("Starting the local app at http://localhost:3090.");
  runNpm(["run", "dev", "--", "--hostname", "127.0.0.1"]);
}
