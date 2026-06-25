/**
 * Throwaway dev helper: mint an evaluation API key for an existing environment
 * so you can curl POST /api/v1/flags. NOT the production path — real issuance
 * goes through the createApiKey server action (auth + audit). This skips both.
 *
 * Usage:
 *   bun run scripts/mint-key.ts                 # first environment found
 *   bun run scripts/mint-key.ts production       # first env with key=production
 *
 * Prints the plaintext key ONCE — copy it, it is not recoverable.
 */
import { generateApiKey } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { apiKeys, environments } from "@/lib/db/schema";

const wantKey = process.argv[2]; // optional env key filter, e.g. "production"

const envs = await db.query.environments.findMany({
  with: { project: true },
});

if (envs.length === 0) {
  console.error("No environments in DB. Create a project first (seeds 3 envs).");
  process.exit(1);
}

const env = wantKey ? envs.find((e) => e.key === wantKey) : envs[0];

if (!env) {
  console.error(
    `No environment with key="${wantKey}". Available: ${[...new Set(envs.map((e) => e.key))].join(", ")}`,
  );
  process.exit(1);
}

const { plaintext, keyPrefix, keyHash } = generateApiKey(env.key);

await db.insert(apiKeys).values({
  environmentId: env.id,
  name: `dev mint ${new Date().toISOString()}`,
  keyPrefix,
  keyHash,
});

console.log(`\nProject:     ${env.project.name}`);
console.log(`Environment: ${env.name} (${env.key})`);
console.log(`Env ID:      ${env.id}`);
console.log(`\nAPI key (shown once):\n${plaintext}\n`);
console.log("Test it:");
console.log(
  `  curl -s -XPOST localhost:3000/api/v1/flags \\\n` +
    `    -H "Authorization: Bearer ${plaintext}" \\\n` +
    `    -H "Content-Type: application/json" \\\n` +
    `    -d '{"identity":"user-1"}'\n`,
);

process.exit(0);
