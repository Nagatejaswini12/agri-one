import { StageHub } from "@/components/StageHub";

export default function ProtectHub() {
  return (
    <StageHub
      titleKey="stages.protect.title"
      descriptionKey="stages.protect.description"
      links={[
        { to: "/scan-crop", labelKey: "nav.scanCrop" },
        { to: "/pest-alerts", labelKey: "nav.pestAlerts" }
      ]}
    />
  );
}
