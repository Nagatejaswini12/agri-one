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

void loadLanguage(useAppStore.getState().language);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
