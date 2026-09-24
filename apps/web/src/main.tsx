import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { loadLanguage } from "@/i18n";
import { router } from "@/app/router";
import { AuthProvider } from "@/auth/AuthProvider";
import { useAppStore } from "@/stores/useAppStore";
import "./index.css";

const queryClient = new QueryClient();

/**
 * The language bundle is loaded BEFORE the first render, on purpose.
 *
 * i18n starts with no resources at all, so rendering first meant every
 * screen painted raw keys ("nav.pestAlerts" instead of "Pest Activity")
 * until the bundle arrived. That was supposed to self-correct, but
 * loadLanguage() finishes by calling changeLanguage() with the language
 * i18next already has, which emits no `languageChanged` event -- so the
 * components that had already mounted never re-rendered and the raw keys
 * stayed on screen indefinitely. It reproduced on roughly one page load
 * in five, which is a farmer looking at a screen of dotted identifiers.
 *
 * Waiting here removes the race rather than papering over it. A failed
 * fetch still renders: an app in English by mistake beats a blank page.
 */
async function boot() {
  try {
    await loadLanguage(useAppStore.getState().language);
  } catch {
    // Fall through and render; i18next falls back to the key's own
    // namespace rather than crashing.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

void boot();
