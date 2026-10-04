"use client";

// Anonymous tester session — no sign-in, no personal data required.

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem("mf-session-id");
  if (!id) {
    id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    window.localStorage.setItem("mf-session-id", id);
  }
  return id;
}

export function getTester(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("mf-tester") ?? "";
}

export function setTester(name: string) {
  window.localStorage.setItem("mf-tester", name);
}

export function getRole(): "all" | "patient" | "ops" | "clinician" {
  if (typeof window === "undefined") return "all";
  const r = new URLSearchParams(window.location.search).get("role");
  if (r === "patient" || r === "ops" || r === "clinician") return r;
  return "all";
}
