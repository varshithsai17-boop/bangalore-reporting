/** Small DOM markers shared by both map engines. */
export function markerEl(kind: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `mk mk-${kind}`;
  if (kind === "pin") {
    el.innerHTML =
      '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 2 23.5 2 14.5a13 13 0 0 1 26 0C28 23.5 15 39 15 39z" fill="#eef1ea" stroke="#0b141c" stroke-width="2"/><path d="M9 16c2 -1.6 4 -1.6 6 0s4 1.6 6 0" fill="none" stroke="#0b141c" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  return el;
}
