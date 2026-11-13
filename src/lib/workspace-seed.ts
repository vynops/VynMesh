import type Database from "better-sqlite3";
import { hashPassword } from "./passwords.ts";

export function seedWorkspaceOwner(database: Database.Database) {
  const passwordHash = hashPassword("changeme");
  database.prepare(`
    insert into users (id, email, display_name, password_hash, must_change_password)
    values (?, ?, ?, ?, 1)
    on conflict (id) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      password_hash = case when users.email <> excluded.email or users.password_hash is null then excluded.password_hash else users.password_hash end,
      must_change_password = case when users.email <> excluded.email or users.password_hash is null then 1 else users.must_change_password end
  `).run("user-demo", "owner@vynmesh.local", "Mesh Owner", passwordHash);
  database.prepare("insert into workspace_memberships (workspace_id, user_id, role) values (?, ?, ?) on conflict (workspace_id, user_id) do nothing").run("workspace-northstar", "user-demo", "owner");
}
