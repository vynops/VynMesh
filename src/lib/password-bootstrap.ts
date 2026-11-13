import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { hashPassword } from "./passwords.ts";

const TOKEN_TTL_MS = 10 * 60_000;

export function createPasswordChangeToken(database: Database.Database, userId: string, workspaceId: string, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  database.prepare("delete from password_change_tokens where user_id = ? or expires_at <= ?").run(userId, now);
  database.prepare("insert into password_change_tokens (token_hash, user_id, workspace_id, expires_at) values (?, ?, ?, ?)").run(createHash("sha256").update(token).digest("hex"), userId, workspaceId, now + TOKEN_TTL_MS);
  return token;
}

export function completeInitialPasswordChange(database: Database.Database, token: string, password: string, now = Date.now()) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return database.transaction(() => {
    const row = database.prepare("select t.user_id, t.workspace_id from password_change_tokens t join users u on u.id = t.user_id join workspace_memberships m on m.user_id = t.user_id and m.workspace_id = t.workspace_id and m.is_blocked = 0 where t.token_hash = ? and t.expires_at > ? and u.must_change_password = 1").get(tokenHash, now) as { user_id: string; workspace_id: string } | undefined;
    if (!row) return null;
    const result = database.prepare("update users set password_hash = ?, must_change_password = 0 where id = ? and must_change_password = 1").run(hashPassword(password), row.user_id);
    if (result.changes !== 1) return null;
    database.prepare("delete from password_change_tokens where user_id = ?").run(row.user_id);
    return { userId: row.user_id, workspaceId: row.workspace_id };
  })();
}
