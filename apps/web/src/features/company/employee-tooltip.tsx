import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export function EmployeeTooltip({ label, children, side = "right" }: { label: ReactNode; children: ReactElement; side?: "right" | "bottom" }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={800} render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
