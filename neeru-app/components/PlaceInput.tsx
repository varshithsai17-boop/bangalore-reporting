"use client";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { Place } from "@/lib/types";

type Props = {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  /** Adds a "Your location" option at the top of the list. */
  onUseLocation?: () => void;
  locating?: boolean;
};

export default function PlaceInput({ label, placeholder, value, onChange, onUseLocation, locating }: Props) {
  const id = useId();
  const [text, setText] = useState(value?.title ?? "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const session = useRef<string>("");
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value?.title ?? ""), [value]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    ctl.current?.abort();
    if (q.trim().length < 2) {
      setItems([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const c = new AbortController();
      ctl.current = c;
      try {
        const r = await api.places(q, session.current, c.signal);
        if (!c.signal.aborted) {
          setItems(r.places);
          setErr(null);
          setActive(r.places.length ? 0 : -1);
        }
      } catch (e) {
        if (!c.signal.aborted) setErr((e as Error).message);
      } finally {
        if (!c.signal.aborted) setBusy(false);
      }
    }, 280);
  }

  const options: ({ kind: "loc" } | { kind: "place"; place: Place })[] = [
    ...(onUseLocation ? [{ kind: "loc" as const }] : []),
    ...items.map((place) => ({ kind: "place" as const, place })),
  ];

  function choose(i: number) {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    if (o.kind === "loc") onUseLocation?.();
    else {
      onChange(o.place);
      setText(o.place.title);
      session.current = "";
    }
  }

  return (
    <div className="place" ref={wrap}>
      <label htmlFor={id} className="place-label">
        {label}
      </label>
      <input
        id={id}
        className="place-input"
        value={locating ? "Finding you…" : text}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
        onFocus={(e) => {
          if (!session.current) session.current = crypto.randomUUID();
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          setOpen(true);
          search(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(options.length - 1, a + 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
          else if (e.key === "Enter" && open && active >= 0) (e.preventDefault(), choose(active));
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {text && !locating && (
        <button
          type="button"
          className="place-clear"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => {
            setText("");
            onChange(null);
            setItems([]);
          }}
        >
          ×
        </button>
      )}
      {open && (options.length > 0 || busy || err) && (
        <ul id={`${id}-list`} role="listbox" className="place-list">
          {options.map((o, i) => (
            <li
              key={o.kind === "loc" ? "loc" : `${o.place.title}-${i}`}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : ""}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
            >
              {o.kind === "loc" ? (
                <>
                  <span className="place-title loc">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" fill="currentColor" />
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Your location
                  </span>
                  <span className="place-sub">Uses your phone's GPS</span>
                </>
              ) : (
                <>
                  <span className="place-title">{o.place.title}</span>
                  {o.place.subtitle && <span className="place-sub">{o.place.subtitle}</span>}
                </>
              )}
            </li>
          ))}
          {busy && <li className="place-note">Searching…</li>}
          {!busy && err && <li className="place-note">{err}</li>}
          {!busy && !err && text.trim().length >= 2 && items.length === 0 && <li className="place-note">No places found. Try a landmark or area name.</li>}
        </ul>
      )}
    </div>
  );
}
