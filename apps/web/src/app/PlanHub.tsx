import { StageHub } from "@/components/StageHub";

export default function PlanHub() {
  return (
    <StageHub
      titleKey="stages.plan.title"
      descriptionKey="stages.plan.description"
      links={[
        { to: "/farms", labelKey: "nav.farms" },
        { to: "/soil-water", labelKey: "nav.soilWater" }
      ]}
    />
  );
}
