import { StageHub } from "@/components/StageHub";

export default function SellHub() {
  return (
    <StageHub
      titleKey="stages.sell.title"
      descriptionKey="stages.sell.description"
      links={[
        { to: "/market", labelKey: "nav.market" },
        { to: "/marketplace", labelKey: "nav.marketplace" }
      ]}
    />
  );
}
