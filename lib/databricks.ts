type SqlParameter = {
  name: string;
  value: string;
  type?: "STRING" | "INT" | "DOUBLE" | "TIMESTAMP";
};

type StatementResponse = {
  statement_id?: string;
  status?: {
    state?: string;
    error?: {
      message?: string;
    };
  };
  manifest?: {
    schema?: {
      columns?: Array<{ name: string }>;
    };
  };
  result?: {
    data_array?: unknown[][];
  };
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function databricksHost() {
  return requiredEnv("DATABRICKS_HOST").replace(/\/$/, "");
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const host = databricksHost();
  const clientId = requiredEnv("DATABRICKS_CLIENT_ID");
  const clientSecret = requiredEnv("DATABRICKS_CLIENT_SECRET");

  const response = await fetch(`${host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64"
      )}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis"
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000
  };

  return cachedToken.token;
}

async function fetchStatement(statementId: string, token: string) {
  const response = await fetch(`${databricksHost()}/api/2.0/sql/statements/${statementId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = (await response.json()) as StatementResponse;

  if (!response.ok) {
    throw new Error(`Statement polling failed: ${JSON.stringify(data)}`);
  }

  return data;
}

function rowsFromStatement(data: StatementResponse) {
  const columns = data.manifest?.schema?.columns?.map((column) => column.name) ?? [];
  const rows = data.result?.data_array ?? [];

  return rows.map((row) =>
    Object.fromEntries(columns.map((name, index) => [name, row[index]]))
  );
}

export async function runSql(statement: string, parameters: SqlParameter[] = []) {
  const token = await getAccessToken();

  const response = await fetch(`${databricksHost()}/api/2.0/sql/statements/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      warehouse_id: requiredEnv("WAREHOUSE_ID"),
      statement,
      parameters,
      wait_timeout: "30s",
      disposition: "INLINE",
      format: "JSON_ARRAY"
    })
  });

  let data = (await response.json()) as StatementResponse;

  if (!response.ok) {
    throw new Error(`SQL request failed: ${JSON.stringify(data)}`);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = data.status?.state;

    if (state === "SUCCEEDED") {
      return rowsFromStatement(data);
    }

    if (state === "FAILED" || state === "CANCELED" || state === "CLOSED") {
      throw new Error(data.status?.error?.message ?? `SQL statement ${state}`);
    }

    if (!data.statement_id) {
      throw new Error(`SQL statement did not return statement_id: ${JSON.stringify(data)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    data = await fetchStatement(data.statement_id, token);
  }

  throw new Error("SQL statement timed out while polling.");
}
