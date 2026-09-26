/**
 * Which pages have real footage behind them, and which do not.
 *
 * Only four clips exist in public/video, and only where a clip actually
 * shows what the page is about does it get used. Everything else falls
 * back to an animated gradient in the module's own accent — that is a
 * deliberate choice, not a gap waiting to be filled. Footage of a crop
 * scan behind the voice assistant would quietly mislabel the page.
 *
 * Adding an entry here is the only thing needed to give a page video.
 */

export interface PageVideo {
  poster: string;
  sources: { src: string; type: string }[];
}

const media: Record<string, PageVideo> = {
  dashboard: {
    poster: "/video/dashboard-hero-poster.webp",
    sources: [
      { src: "/video/dashboard-hero.webm", type: "video/webm" },
      { src: "/video/dashboard-hero.mp4", type: "video/mp4" }
    ]
  },
  farms: {
    poster: "/video/farms-hero-poster.webp",
    sources: [
      { src: "/video/farms-hero.webm", type: "video/webm" },
      { src: "/video/farms-hero.mp4", type: "video/mp4" }
    ]
  },
  diagnosis: {
    poster: "/video/diagnosis-hero-poster.webp",
    sources: [
      { src: "/video/diagnosis-hero.webm", type: "video/webm" },
      { src: "/video/diagnosis-hero.mp4", type: "video/mp4" }
    ]
  },
  // Marketplace has no entry on purpose. The supplied "market place"
  // clip contains no marketplace — it is crop rows and a leaf macro
  // with a data overlay, the same subject as the other two. Behind a
  // page about finding somewhere to sell, that footage would read as a
  // mistake, so the page takes its accent gradient instead and the
  // clip is not shipped at all.
  //
  // Voice AI has no entry for the same kind of reason: the supplied
  // "voice AI" file is byte-identical to the crop-scanning one.
};

export function videoFor(id: string): PageVideo | null {
  return media[id] ?? null;
}
