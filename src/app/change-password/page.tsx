"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Network } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not change your password.");
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change your password.");
      setLoading(false);
    }
  }

  return <main className="login-page">
    <div className="login-wrap">
      <div className="login-brand"><div className="brand-mark large"><Network size={23} /></div><h1>Vyn<span>Mesh</span></h1><p>Data Intelligence Platform</p></div>
      <form className="login-form" onSubmit={submit}>
        <h2 className="login-title">Set a new password</h2>
        <p className="login-instruction">For security, choose a new password before continuing. Use at least 12 characters.</p>
        {error && <div className="login-alert"><AlertCircle size={15} /> {error}</div>}
        <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <button className="login-button" type="submit" disabled={loading}>{loading ? <><Loader2 size={15} className="spin" /> Saving…</> : "Save password"}</button>
      </form>
    </div>
  </main>;
}
