/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The AGRI ONE palette. Deliberately small: every accent in the
        // app comes from here, so the interface reads as one system
        // rather than a different colour per card.
        agri: {
          // ---- the dark environment the app now sits in ----------
          // Three depths of the same deep forest, so panels can sit on
          // panels without either reading as black.
          night: "#07130F",   // deepest, the page itself
          bark: "#0B2118",    // a surface lifted off the page
          moss: "#102D21",    // a surface lifted off that
          // Text on that environment. Named by role, not by shade, so a
          // page never has to guess which grey is readable here.
          bright: "#ECF6EF",  // headings and primary text
          mist: "#B7CDBF",    // body text
          muted: "#7E9A88",   // captions, labels, "not recorded"
          hair: "#2A4437",    // hairline borders and dividers

          // ---- module accents -----------------------------------
          // Tuned for a dark ground: each one is a step lighter and
          // more saturated than its old light-mode counterpart, which
          // would have gone muddy against #07130F.
          emerald: "#34D399",  // My Farms
          cyan: "#38BDF8",     // Weather
          leaf: "#6EE05B",     // Soil & crop growth
          violet: "#A78BFA",   // Crop Diagnosis
          coral: "#FB7B67",    // Pest Activity
          amber: "#FBBF3C",    // Market Analysis
          orange: "#FB923C",   // Marketplace
          blue: "#60A5FA",     // Government Schemes
          purple: "#C084FC",   // Reports
          teal: "#2DD4BF",     // Scan History
          pink: "#F472B6",     // Voice AI

          // ---- retained names -----------------------------------
          // These are still referenced around the app. They are kept
          // defined, and remapped for a dark ground, rather than
          // deleted: an undefined Tailwind token does not fail the
          // build, it silently drops the rule, which is exactly the
          // kind of breakage that only shows up in a screenshot.
          forest: "#0F2A1E",   // deepest green — now depth, not text
          sky: "#38BDF8",      // was weather; same role, lifted
          olive: "#A3B565",    // soil earth tone, lifted off the dark
          lavender: "#A78BFA", // the assistant
          ivory: "#ECF6EF",    // was the page ground, now bright text
          sand: "#B7CDBF",
          sage: "#7E9A88"
        }
      },
      /**
       * A dark interface needs finer opacity steps than Tailwind ships.
       * Its default scale jumps 5 → 10 → 20, and on this background the
       * difference between a 8% and a 12% hairline is the difference
       * between a visible edge and a glowing one.
       *
       * These must be declared. An opacity outside the scale does not
       * fail the build in a .tsx file — Tailwind simply never generates
       * the rule, and the style vanishes with nothing to show for it.
       */
      opacity: {
        4: "0.04",
        6: "0.06",
        8: "0.08",
        12: "0.12",
        14: "0.14",
        15: "0.15",
        16: "0.16",
        18: "0.18",
        22: "0.22",
        35: "0.35",
        45: "0.45",
        55: "0.55",
        65: "0.65",
        85: "0.85"
      },
      borderRadius: {
        card: "1.25rem"
      },
      boxShadow: {
        // On a dark ground a light drop shadow is invisible, so depth
        // comes from a darker well beneath the card plus a faint light
        // catch along its top edge.
        card: "0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 12px 32px -16px rgba(0, 0, 0, 0.9)",
        "card-hover":
          "0 1px 0 rgba(255, 255, 255, 0.07) inset, 0 20px 44px -18px rgba(0, 0, 0, 0.95)"
      },
      keyframes: {
        // The background's colour fields drift very slowly. Long enough
        // that it reads as depth rather than as something moving.
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(0, -2%, 0) scale(1.06)" }
        },
        // Artwork breathing in place. Three pixels, not a bounce.
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" }
        },
        sheen: {
          "0%": { opacity: "0.25" },
          "50%": { opacity: "0.5" },
          "100%": { opacity: "0.25" }
        }
      },
      animation: {
        drift: "drift 28s ease-in-out infinite",
        "drift-slow": "drift 44s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        sheen: "sheen 9s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
