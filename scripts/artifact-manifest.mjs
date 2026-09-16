import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

const ROOT =
  path.resolve(
    path.dirname(
      fileURLToPath(import.meta.url)
    ),
    ".."
  );

const MANIFEST_PATH =
  path.join(
    ROOT,
    "results",
    "artifact-manifest.json"
  );

const EXCLUDED_DIRECTORIES =
  new Set([
    ".git",
    "node_modules"
  ]);

const EXCLUDED_FILES =
  new Set([
    ".DS_Store"
  ]);

async function collectFiles(
  directory
) {
  const entries =
    await fs.readdir(
      directory,
      {
        withFileTypes:
          true
      }
    );

  const files = [];

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      EXCLUDED_DIRECTORIES.has(
        entry.name
      )
    ) {
      continue;
    }

    if (
      entry.isFile() &&
      EXCLUDED_FILES.has(
        entry.name
      )
    ) {
      continue;
    }

    const absolutePath =
      path.join(
        directory,
        entry.name
      );

    if (entry.isDirectory()) {
      files.push(
        ...await collectFiles(
          absolutePath
        )
      );

      continue;
    }

    if (
      entry.isFile() &&
      absolutePath !==
        MANIFEST_PATH
    ) {
      files.push(
        absolutePath
      );
    }
  }

  return files;
}

async function buildEntries() {
  const files =
    await collectFiles(
      ROOT
    );

  files.sort();

  return Promise.all(
    files.map(
      async absolutePath => {
        const bytes =
          await fs.readFile(
            absolutePath
          );

        return {
          path:
            path
              .relative(
                ROOT,
                absolutePath
              )
              .split(path.sep)
              .join("/"),

          sha256:
            crypto
              .createHash("sha256")
              .update(bytes)
              .digest("hex")
        };
      }
    )
  );
}

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

const files =
  await buildEntries();

if (
  process.argv.includes(
    "--check"
  )
) {
  const manifest =
    JSON.parse(
      await fs.readFile(
        MANIFEST_PATH,
        "utf8"
      )
    );

  assert(
    manifest.algorithm ===
      "sha256",
    "Manifest algorithm must be sha256"
  );

  assert(
    manifest.fileCount ===
      files.length,
    `Manifest fileCount expected ${files.length}, got ${manifest.fileCount}`
  );

  assert(
    JSON.stringify(
      manifest.files
    ) ===
      JSON.stringify(files),
    "Manifest paths or hashes do not match the repository"
  );

  console.log(
    `Artifact manifest verified: ${files.length} files`
  );
} else {
  const manifest = {
    generatedAt:
      new Date()
        .toISOString(),

    algorithm:
      "sha256",

    fileCount:
      files.length,

    files
  };

  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      manifest,
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `Artifact manifest generated: ${files.length} files`
  );
}
