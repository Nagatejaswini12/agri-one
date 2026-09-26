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
          ivory: "#FBF8F1",   // warm paper the whole app sits on
          sand: "#F3EEE2",
          sage: "#E6EDE1",
          forest: "#1B4332",  // headings, deepest green
          leaf: "#4D9A3F",    // growth, crop health
          sky: "#3B93C9",     // weather
          olive: "#7C8C43",   // soil, earth
          amber: "#D99A2B",   // market, money
          teal: "#2E8B84",    // government schemes
          lavender: "#8B7BC8", // the assistant
          coral: "#E0806A"    // gentle warmth, used sparingly
        }
      },
      borderRadius: {
        card: "1.25rem"
      },
      boxShadow: {
        // One soft, low-contrast lift. Cards are separated by tone and a
        // hairline border, not by heavy drop shadows.
        card: "0 1px 2px rgba(27, 67, 50, 0.04), 0 8px 24px -12px rgba(27, 67, 50, 0.18)",
        "card-hover": "0 2px 4px rgba(27, 67, 50, 0.06), 0 16px 32px -14px rgba(27, 67, 50, 0.26)"
      }
    }
  },
  plugins: []
};
