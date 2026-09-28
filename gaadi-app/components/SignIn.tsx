"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Me } from "@/lib/client/api";

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; itp_support?: boolean; use_fedcm_for_button?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
let scriptPromise: Promise<void> | null = null;
function loadGoogle() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type SignInText = {
  title: string;
  why: string;
  privacy: string;
  notSetUp: string;
  loadFailed: string;
  signingIn: string;
  cancel: string;
};

/** Bottom sheet with Google's sign-in button. Shown only when someone tries to post. */
export default function SignInSheet(p: { text: SignInText; lang: string; onDone: (u: Me) => void; onClose: () => void }) {
  const btn = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(CLIENT_ID ? null : p.text.notSetUp);
  const [busy, setBusy] = useState(false);
  const done = useRef(p.onDone);
  done.current = p.onDone;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let live = true;
    loadGoogle()
      .then(() => {
        if (!live || !btn.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: "popup",
          itp_support: true,
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            setBusy(true);
            setErr(null);
            try {
              const r = await api.signIn(credential);
              done.current(r.user);
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          },
        });
        btn.current.innerHTML = "";
        window.google.accounts.id.renderButton(btn.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "left",
          width: 280,
          locale: p.lang,
        });
      })
      .catch(() => live && setErr(p.text.loadFailed));
    return () => {
      live = false;
    };
  }, [p.lang, p.text.loadFailed]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p]);

  return (
    <div className="sheet-back" onClick={p.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="signin-title">{p.text.title}</h2>
        <p>{p.text.why}</p>
        <div className="gbtn" ref={btn} aria-busy={busy} />
        {busy && <p className="muted small">{p.text.signingIn}</p>}
        {err && <p className="warn small">{err}</p>}
        <p className="muted small">{p.text.privacy}</p>
        <button className="linkish center" onClick={p.onClose}>
          {p.text.cancel}
        </button>
      </div>
    </div>
  );
}

export function googleSignOut() {
  try {
    window.google?.accounts.id.disableAutoSelect();
  } catch {}
}
