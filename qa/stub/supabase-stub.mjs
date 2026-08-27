/**
 * A Supabase-compatible HTTP stub for QA runs.
 *
 * It implements only the endpoints this app actually calls, backed by a real
 * local PostgreSQL running the real migrations. Every request runs as the
 * `authenticated` role with `request.jwt.claim.sub` set, so the Row Level
 * Security policies and the SECURITY INVOKER RPCs under test are the genuine
 * ones — only the GoTrue/PostgREST HTTP layer is simulated.
 *
 * This is deliberately NOT a PostgREST implementation. It handles the specific
 * queries in src/lib/data.ts and nothing else; an unrecognised route returns
 * 501 loudly rather than silently returning [].
 */

import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.QA_STUB_PORT ?? 54331);
const JWT_SECRET = "qa-stub-secret-not-a-real-credential";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "/tmp/lifts-qa-sock",
  port: Number(process.env.PGPORT ?? 5601),
  user: process.env.PGUSER ?? "postgres",
  database: process.env.PGDATABASE ?? "postgres",
  max: 8,
});

// --- tiny JWT (HS256) -------------------------------------------------------
// supabase-js only reads the payload for expiry; it never verifies the
// signature. A real signature is produced anyway so the token is well-formed.

const b64url = (input) => Buffer.from(input).toString("base64url");

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;
  return {
    access_token: signJwt({
      sub: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      iat: now,
      exp: expiresAt,
    }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: `refresh-${user.id}`,
    user: authUser(user),
  };
}

function authUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
}

// --- database helpers -------------------------------------------------------

/** Runs `fn` inside a transaction scoped to `userId` so RLS applies for real. */
async function asUser(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Privileged query, used only for the auth tables the stub owns. */
async function admin(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// --- request plumbing -------------------------------------------------------

function send(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function bearer(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // The anon key is sent as the bearer when signed out; it is not a JWT here.
  const claims = decodeJwt(token);
  return claims?.sub ?? null;
}

// --- auth endpoints ---------------------------------------------------------

async function handleAuth(req, res, url) {
  const path = url.pathname.replace("/auth/v1", "");

  if (path === "/settings") {
    return send(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
  }

  if (path === "/signup" && req.method === "POST") {
    const { email, password } = await readBody(req);
    if (!email || !password) {
      return send(res, 400, { error: "invalid_request", error_description: "Email and password are required" });
    }
    const existing = await admin("select id from auth.users where email = $1", [email]);
    if (existing.rowCount) {
      return send(res, 422, { code: 422, msg: "User already registered" });
    }
    const id = randomUUID();
    // The handle_new_user trigger fires here, creating the profile row.
    await admin("insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)", [
      id,
      email,
      password,
    ]);
    return send(res, 200, session({ id, email }));
  }

  if (path === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const body = await readBody(req);

    if (grant === "refresh_token") {
      const id = String(body.refresh_token ?? "").replace(/^refresh-/, "");
      const found = await admin("select id, email from auth.users where id = $1", [id]);
      if (!found.rowCount) return send(res, 401, { error: "invalid_grant" });
      return send(res, 200, session(found.rows[0]));
    }

    const found = await admin(
      "select id, email from auth.users where email = $1 and encrypted_password = $2",
      [body.email, body.password],
    );
    if (!found.rowCount) {
      return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    return send(res, 200, session(found.rows[0]));
  }

  if (path === "/user" && req.method === "GET") {
    const userId = bearer(req);
    if (!userId) return send(res, 401, { message: "invalid claim: missing sub claim" });
    const found = await admin("select id, email from auth.users where id = $1", [userId]);
    if (!found.rowCount) return send(res, 401, { message: "user not found" });
    return send(res, 200, authUser(found.rows[0]));
  }

  if (path === "/logout" && req.method === "POST") {
    return send(res, 204);
  }

  return send(res, 501, { message: `QA stub: unhandled auth route ${req.method} ${path}` });
}

// --- PostgREST subset -------------------------------------------------------

const WORKOUTS_SQL = `
  select coalesce(json_agg(w order by w.performed_at, w.created_at), '[]'::json) as data
  from (
    select
      w.id, w.day, w.performed_at, w.created_at, w.notes,
      coalesce((
        select json_agg(json_build_object(
          'exercise_id', we.exercise_id,
          'name', we.name,
          'weight', we.weight,
          'unit', we.unit,
          'rir', we.rir,
          'position', we.position,
          'workout_sets', coalesce((
            select json_agg(json_build_object('set_number', ws.set_number, 'reps', ws.reps)
                            order by ws.set_number)
            from public.workout_sets ws where ws.workout_exercise_id = we.id
          ), '[]'::json)
        ) order by we.position)
        from public.workout_exercises we where we.workout_id = w.id
      ), '[]'::json) as workout_exercises
    from public.workouts w
  ) w
`;

async function handleRest(req, res, url) {
  const userId = bearer(req);
  const table = url.pathname.replace("/rest/v1/", "");

  if (table.startsWith("rpc/")) {
    const fn = table.slice(4);
    const allowed = ["save_workout", "save_starting_weights", "import_backup", "delete_all_data"];
    if (!allowed.includes(fn)) {
      return send(res, 501, { message: `QA stub: unknown rpc ${fn}` });
    }
    const args = await readBody(req);
    const names = Object.keys(args);
    const placeholders = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
    const values = names.map((n) => {
      const v = args[n];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    try {
      const result = await asUser(userId, (c) =>
        c.query(`select public.${fn}(${placeholders}) as result`, values),
      );
      return send(res, 200, result.rows[0]?.result ?? null);
    } catch (error) {
      return send(res, 400, { message: error.message, code: error.code ?? "P0001" });
    }
  }

  try {
    if (table === "workouts" && req.method === "GET") {
      const result = await asUser(userId, (c) => c.query(WORKOUTS_SQL));
      return send(res, 200, result.rows[0].data);
    }

    if (table === "user_exercise_settings" && req.method === "GET") {
      const result = await asUser(userId, (c) =>
        c.query("select day, exercise_id, starting_weight from public.user_exercise_settings"),
      );
      return send(res, 200, result.rows);
    }

    if (table === "workouts" && req.method === "DELETE") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
      await asUser(userId, (c) => c.query("delete from public.workouts where id = $1", [id]));
      return send(res, 204);
    }
  } catch (error) {
    return send(res, 400, { message: error.message, code: error.code ?? "P0001" });
  }

  return send(res, 501, { message: `QA stub: unhandled rest route ${req.method} ${url.pathname}` });
}

// --- server -----------------------------------------------------------------

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1")) return await handleRest(req, res, url);
    return send(res, 501, { message: `QA stub: unhandled ${req.method} ${url.pathname}` });
  } catch (error) {
    console.error("[qa-stub]", error);
    return send(res, 500, { message: String(error?.message ?? error) });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[qa-stub] listening on http://127.0.0.1:${PORT}`);
});
