import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sourcesRoot } from "@/lib/connectors";

export function ensureSampleSources() {
  mkdirSync(sourcesRoot, { recursive: true });
  ensureOrdersDatabase();
  ensureRiskEvents();
  ensureDocuments();
}

function ensureOrdersDatabase() {
  const dbPath = path.join(sourcesRoot, "orders.db");
  if (existsSync(dbPath)) return;
  const db = new Database(dbPath);
  db.exec("create table orders (customer_id text, order_status text, region text, order_date text, product text)");
  const insert = db.prepare("insert into orders (customer_id, order_status, region, order_date, product) values (?, ?, ?, ?, ?)");
  insert.run("1042", "fulfilled", "North America", "2026-09-07", "Enterprise storage");
  insert.run("1088", "pending", "Europe", "2026-09-08", "Data governance module");
  db.close();
}

function ensureRiskEvents() {
  const filePath = path.join(sourcesRoot, "risk-events.json");
  if (existsSync(filePath)) return;
  const events = [
    { customer_id: "1042", event_type: "payment_review", risk_score: 0.72, event_time: "2026-09-08T09:00:00Z", note: "Customer 1042 risk event: payment review pending. Risk score 0.72. Review policy changed on 2026-09-08." },
    { customer_id: "1088", event_type: "identity_check", risk_score: 0.31, event_time: "2026-09-08T14:00:00Z", note: "Customer 1088 completed identity verification with no findings." },
  ];
  writeFileSync(filePath, JSON.stringify(events, null, 2));
}

function ensureDocuments() {
  const dir = path.join(sourcesRoot, "documents");
  mkdirSync(dir, { recursive: true });
  const policyPath = path.join(dir, "enterprise-policy.txt");
  if (!existsSync(policyPath)) writeFileSync(policyPath, "Enterprise customers may request a payment review within 30 days. Requests require identity verification and an account owner approval.");
  const handlingPath = path.join(dir, "data-handling-standard.txt");
  if (!existsSync(handlingPath)) writeFileSync(handlingPath, "Customer personal information is classified as restricted. Access must be logged and retained for audit review.");
}
