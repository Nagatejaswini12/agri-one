import { StageHub } from "@/components/StageHub";

export default function MoreHub() {
  return (
    <StageHub
      titleKey="stages.more.title"
      descriptionKey="stages.more.description"
      links={[
        { to: "/schemes", labelKey: "nav.schemes" },
        { to: "/reports", labelKey: "nav.reports" },
        { to: "/scan-history", labelKey: "nav.scanHistory" }
      ]}
    />
  );
}
