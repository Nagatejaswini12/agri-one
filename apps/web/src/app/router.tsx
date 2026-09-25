import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { RequireAuth } from "@/auth/RequireAuth";
import { NotFound } from "@/components/NotFound";
import SignInPage from "@/auth/SignInPage";
import SignUpPage from "@/auth/SignUpPage";
import ForgotPasswordPage from "@/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/auth/ResetPasswordPage";
import DashboardPage from "@/modules/dashboard";
import PlanHub from "@/app/PlanHub";
import GrowHub from "@/app/GrowHub";
import ProtectHub from "@/app/ProtectHub";
import SellHub from "@/app/SellHub";
import MoreHub from "@/app/MoreHub";
import ProfilePage from "@/modules/profile";
import FarmsPage from "@/modules/farms";
import FarmDetailPage from "@/modules/farms/FarmDetail";
import ScanCropPage from "@/modules/scan-crop";
import WeatherPage from "@/modules/weather";
import SoilWaterPage from "@/modules/soil-water";
import PestAlertsPage from "@/modules/pest-alerts";
import MarketPage from "@/modules/market";
import MarketplacePage from "@/modules/marketplace";
import SchemesPage from "@/modules/schemes";
import ReportsPage from "@/modules/reports";
import ScanHistoryPage from "@/modules/scan-history";
import VoiceAiPage from "@/modules/voice-ai";

export const router = createBrowserRouter([
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/sign-up", element: <SignUpPage /> },
  // Public on purpose: a farmer arriving on a recovery link has only a
  // temporary recovery session, and RequireAuth would send them to
  // sign-in — the one place they cannot get to.
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      // Stage hubs (PLAN → GROW → PROTECT → SELL). GROW has a single
      // module, so it links straight to Weather instead of a hub page.
      { path: "plan", element: <PlanHub /> },
      // GROW is a stage section now rather than a redirect. /weather
      // is unchanged and still reachable directly.
      { path: "grow", element: <GrowHub /> },
      { path: "protect", element: <ProtectHub /> },
      { path: "sell", element: <SellHub /> },
      { path: "more", element: <MoreHub /> },
      { path: "profile", element: <ProfilePage /> },
      // Individual modules
      { path: "farms", element: <FarmsPage /> },
      { path: "farms/:farmId", element: <FarmDetailPage /> },
      { path: "scan-crop", element: <ScanCropPage /> },
      { path: "weather", element: <WeatherPage /> },
      { path: "soil-water", element: <SoilWaterPage /> },
      { path: "pest-alerts", element: <PestAlertsPage /> },
      { path: "market", element: <MarketPage /> },
      { path: "marketplace", element: <MarketplacePage /> },
      { path: "schemes", element: <SchemesPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "scan-history", element: <ScanHistoryPage /> },
      { path: "voice-ai", element: <VoiceAiPage /> },
      // Without this, an unknown URL matched no route and rendered a
      // blank page with no way back.
      { path: "*", element: <NotFound /> }
    ]
  }
]);
