"use client";
import { useEffect, useState } from "react";

export default function ShareBar({ text, path }: { text: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(path);
  useEffect(() => setUrl(`${window.location.origin}${path}`), [path]);
  return (
    <div className="share-bar">
      <a className="btn primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>
        WhatsApp
      </a>
      <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>
        Post on X
      </a>
      <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>
        LinkedIn
      </a>
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
