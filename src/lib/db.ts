import sql from "mssql";

const globalForDb = globalThis as unknown as {
  sqlPool: sql.ConnectionPool | undefined;
};

function getConfig(): sql.config {
  const server = process.env.DB_SERVER;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME ?? "minimrp2025";

  if (!server || !user || !password) {
    throw new Error(
      "Database is not configured. Set DB_SERVER, DB_USER, and DB_PASSWORD.",
    );
  }

  return {
    server,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
    database,
    user,
    password,
    options: {
      encrypt: process.env.DB_ENCRYPT !== "false",
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
  };
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!globalForDb.sqlPool) {
    globalForDb.sqlPool = await sql.connect(getConfig());
  } else if (!globalForDb.sqlPool.connected) {
    globalForDb.sqlPool = await sql.connect(getConfig());
  }

  return globalForDb.sqlPool;
}
