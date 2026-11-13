"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Network } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sign in failed.");
      if (result.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
      setLoading(false);
    }
  }

  return <main className="login-page">
    <div className="login-wrap">
      <div className="login-brand"><div className="brand-mark large"><Network size={23} /></div><h1>Vyn<span>Mesh</span></h1><p>Data Intelligence Platform</p></div>
      <form className="login-form" onSubmit={submit}>
        {error && <div className="login-alert"><AlertCircle size={15} /> {error}</div>}
        <h2 className="login-title">Sign In</h2>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@vynmesh.local" /></label>
        <label>Password<div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Show password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>
        <button className="login-button" type="submit" disabled={loading}>{loading ? <><Loader2 size={15} className="spin" /> Signing in…</> : "Sign in"}</button>
      </form>
      <p className="login-suite">Part of the <span>VynOps Suite</span></p>
    </div>
  </main>;
}
