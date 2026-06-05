#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const defaultOutputPath = path.join(
  repoRoot,
  "artifacts",
  "wpt-reftest",
  "MANIFEST.json",
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseArgs(argv) {
  const opts = {
    out: defaultOutputPath,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      opts.out = path.resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelpAndExit(1);
    }
  }

  return opts;
}

function printHelpAndExit(exitCode) {
  process.stdout.write(`Download the latest WPT MANIFEST.json release asset.

Usage:
  yarn download:wpt-manifest [--out <path>]

Options:
  --out <path>   Output path (default: artifacts/wpt-reftest/MANIFEST.json)
  -h, --help     Show this help
`);
  process.exit(exitCode);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "vivliostyle-layout-regression",
    },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText})`,
    );
  }
  return response.json();
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "vivliostyle-layout-regression",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Manifest download failed (${response.status} ${response.statusText})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const release = await fetchJson(
    "https://api.github.com/repos/web-platform-tests/wpt/releases/latest",
  );
  const asset = (release.assets || []).find((item) =>
    /^MANIFEST-.*\.json\.gz$/.test(String(item.name || "")),
  );

  if (!asset?.browser_download_url) {
    throw new Error(
      "Could not find a MANIFEST.json.gz asset in the latest WPT release",
    );
  }

  const compressed = await fetchBytes(asset.browser_download_url);
  const manifest = gunzipSync(compressed);

  ensureDir(path.dirname(opts.out));
  fs.writeFileSync(opts.out, manifest);

  console.log(`Downloaded ${asset.name}`);
  console.log(`Saved WPT manifest to ${opts.out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
