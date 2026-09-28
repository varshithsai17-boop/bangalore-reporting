import type { Metadata } from "next";
import Link from "next/link";
import { CITY_WHATSAPP_DISPLAY, MIN_CHECKINS } from "@/lib/constants";

export const metadata: Metadata = { title: "How it works" };

export default function About() {
  return (
    <div className="page narrow">
      <header className="top">
        <Link href="/" className="brand">
          <span className="word">
            Gaadi Bantha<span className="q">?</span>
          </span>
        </Link>
        <nav className="nav">
          <Link href="/">Map</Link>
          <Link href="/wards">Ward rankings</Link>
        </nav>
      </header>
      <article className="card prose">
        <h1>How Gaadi Bantha works</h1>
        <p>
          Bengaluru is moving to a new garbage collection system with GPS-tracked vans. The promise is simple: the van reaches every doorstep. Gaadi Bantha lets
          residents check that promise, one tap a day.
        </p>
        <h2>The daily check-in</h2>
        <p>
          Set your street once. Each day, tap whether the van came, didn't come, or came but didn't take your waste. One answer per phone per day; you can change it
          the same day. Your ward's score is the share of check-ins that say the van came. A ward needs at least {MIN_CHECKINS} check-ins in the week before it gets a
          score, so a few answers can't swing it.
        </p>
        <h2>Garbage spots</h2>
        <p>
          Report a dumping spot, overflowing bin, garbage burning or garbage blocking a drain, with a photo. Reports close to each other are merged. A spot is marked
          cleaned when two people say so, or when one person adds an "after" photo. The "WhatsApp the city" button sends a ready-written complaint, with the location
          and photo link, to the city's waste line ({CITY_WHATSAPP_DISPLAY}).
        </p>
        <h2>What we store</h2>
        <p>
          No accounts and no names. Your street is saved only on your phone. Check-ins are stored with the location rounded to about 10 metres, your ward and a random
          id for your browser. Your IP address is scrambled (hashed) before it's stored and is only used to stop spam. Photos are shrunk on your phone before
          upload, which removes the location data cameras hide inside them. Photos flagged by three people are hidden.
        </p>
        <h2>Where the numbers come from</h2>
        <p>
          Everything on this site comes from residents' check-ins and reports. These are not official figures. Ward boundaries are the GBA final delimitation of
          December 2025 (369 wards across five corporations), from OpenCity.
        </p>
      </article>
    </div>
  );
}
