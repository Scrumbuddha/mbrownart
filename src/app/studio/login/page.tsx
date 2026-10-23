"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <main style={{ maxWidth: 360, margin: "0 auto", padding: "96px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 24px" }}>Studio</h1>
      <form action={action}>
        <label htmlFor="password" style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          style={{ width: "100%", padding: "10px 12px", fontSize: 16, border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit" }}
        />
        {state.error && (
          <p role="alert" style={{ color: "#b04a3a", fontSize: 14, margin: "12px 0 0" }}>
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          style={{ marginTop: 16, width: "100%", padding: "10px 12px", fontSize: 16, fontWeight: 500, background: "#222", color: "#fff", border: 0, borderRadius: 4, fontFamily: "inherit", cursor: "pointer" }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
