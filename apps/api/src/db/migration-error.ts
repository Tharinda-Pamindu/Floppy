/** Safe diagnostics: never print SQL, parameters, connection URLs or raw errors. */
const hints: Record<string, string> = {
  "28P01": "Database authentication failed. Check the database password and connection username.",
  "28000": "Database authentication was rejected. Check the connection credentials and access settings.",
  "42501": "The database role lacks permission. Use a migration role allowed to create schemas and apply the migrations.",
  "3D000": "The configured database does not exist. Check the database name in the connection string.",
  "53300": "The database has too many connections. Check the pooler and database connection limits.",
  "57P03": "The database is not accepting connections yet. Check whether the project is paused or restarting.",
  ECONNREFUSED: "The database connection was refused. Check the connection host, port and project status.",
  ENOTFOUND: "The database hostname could not be resolved. Copy the connection string from Supabase Connect.",
  EAI_AGAIN: "Database DNS lookup temporarily failed. Retry and check the connection host.",
  ENETUNREACH: "The database network is unreachable. For IPv4 connectivity, use Supabase Session pooler on port 5432.",
  EHOSTUNREACH: "The database host is unreachable. Check the network and Supabase Session pooler connection.",
  ETIMEDOUT: "The database connection timed out. Check network restrictions, the host and port.",
  CONNECT_TIMEOUT: "The database connection timed out. Check network restrictions, the host and port.",
  CONNECTION_CLOSED: "The database closed the connection. Check SSL settings, the pooler and project status.",
  ECONNRESET: "The database connection was reset. Check the pooler, SSL settings and project status.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "The database TLS certificate is not trusted. Configure the provider CA certificate; do not disable verification.",
  SELF_SIGNED_CERT_IN_CHAIN: "The database TLS certificate chain is not trusted. Configure the provider CA certificate; do not disable verification.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "The database TLS certificate chain could not be verified. Check the provider CA certificate.",
  CERT_HAS_EXPIRED: "The database TLS certificate has expired. Check with the database provider.",
  ERR_TLS_CERT_ALTNAME_INVALID: "The database TLS certificate does not match the hostname. Check the connection hostname.",
  ERR_INVALID_URL: "The database connection URL is malformed. Copy the URI and URL-encode special characters in the password.",
  ENOENT: "A migration file could not be found. Check that the committed drizzle directory is included in the deployment.",
};

export function migrationFailureDetails(error: unknown): string[] {
  const details = new Set<string>();
  const visited = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || visited.has(value) || depth > 10) return;
    visited.add(value);
    const e = value as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown };
    const code = typeof e.code === "string" ? e.code : "";
    if (Object.hasOwn(hints, code)) details.add(`[${code}] ${hints[code]}`);
    else if (/^[0-9A-Z]{5}$/.test(code)) details.add(`[${code}] PostgreSQL rejected the operation. Check this SQLSTATE in the database provider logs.`);
    // Some pooler failures only have a generic SQLSTATE. Recognize known messages
    // without ever copying potentially sensitive message text to the output.
    const message = typeof e.message === "string" ? e.message : "";
    if (/tenant or user not found/i.test(message)) details.add("The pooler did not recognize the tenant or user. Copy the exact Session pooler username from Supabase Connect.");
    if (/SSL connection is required|SSL is required/i.test(message)) details.add("The database requires SSL. Set DATABASE_SSL=true.");
    visit(e.cause, depth + 1);
    if (Array.isArray(e.errors)) for (const nested of e.errors.slice(0, 10)) visit(nested, depth + 1);
  }
  visit(error, 0);
  return details.size ? [...details] : ["No recognized database error code was provided. Check the database provider logs at the release timestamp. Raw error details are omitted to protect credentials and data."];
}
