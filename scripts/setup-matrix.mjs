import { randomBytes } from "node:crypto";
import { mkdir, access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const configFile = resolve(root, "infra/data/synapse/homeserver.yaml");
const secretsFile = resolve(root, "infra/secrets/local.env");
const existing = await Promise.all(
  [configFile, secretsFile].map(async (path) => {
    try {
      await access(path);
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return false;
    }
  }),
);
if (existing.every(Boolean)) {
  console.log(
    "Local Matrix configuration already exists. Existing secrets and data were preserved.",
  );
  process.exit(0);
}
if (existing.some(Boolean))
  throw new Error(
    "The local setup is incomplete. Restore the matching config/secrets from your backup before continuing; existing files were preserved.",
  );
const secret = () => randomBytes(32).toString("hex");
const postgresPassword = secret();
const registrationSecret = secret();
await mkdir(resolve(root, "infra/data/synapse"), { recursive: true });
await mkdir(resolve(root, "infra/secrets"), { recursive: true, mode: 0o700 });
await writeFile(
  secretsFile,
  `POSTGRES_DB=synapse\nPOSTGRES_USER=synapse\nPOSTGRES_PASSWORD=${postgresPassword}\n`,
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  resolve(root, "infra/data/synapse/log.config"),
  `version: 1\nformatters:\n  plain:\n    format: '%(asctime)s - %(name)s - %(levelname)s - %(message)s'\nhandlers:\n  console:\n    class: logging.StreamHandler\n    formatter: plain\nloggers:\n  synapse:\n    level: WARNING\nroot:\n  level: WARNING\n  handlers: [console]\ndisable_existing_loggers: false\n`,
  { flag: "wx" },
);
await writeFile(
  configFile,
  `# LOCAL DEVELOPMENT ONLY. Do not expose this configuration to the Internet.
server_name: localhost
public_baseurl: http://localhost:8008/
pid_file: /data/homeserver.pid
report_stats: false
enable_registration: false
registration_shared_secret: "${registrationSecret}"
macaroon_secret_key: "${secret()}"
form_secret: "${secret()}"
signing_key_path: /data/localhost.signing.key
log_config: /data/log.config
media_store_path: /data/media_store
max_upload_size: 20M
url_preview_enabled: false
allow_public_rooms_without_auth: false
allow_public_rooms_over_federation: false
federation_domain_whitelist: []
session_lifetime: 24h
listeners:
  - port: 8008
    tls: false
    bind_addresses: ['0.0.0.0']
    type: http
    x_forwarded: false
    resources:
      - names: [client]
        compress: false
database:
  name: psycopg2
  args:
    user: synapse
    password: "${postgresPassword}"
    database: synapse
    host: postgres
    port: 5432
    cp_min: 5
    cp_max: 10
`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created local Synapse/PostgreSQL configuration with random secrets.",
);
console.log("Next: npm run matrix:up, then npm run matrix:user.");
console.log(
  "This isolated development server uses @username:localhost and does not federate.",
);
