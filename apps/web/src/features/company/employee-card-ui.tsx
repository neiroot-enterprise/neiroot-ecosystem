import type { ComponentProps } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import "./employee-sheet.css";
import { EmployeeTooltip } from "./employee-tooltip";

// Original base-nova default sizing, scoped to existing employee cards.
export const employeeCardButtonSize =
  "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2";

export const employeeSheetContentClassName =
  "employee-sheet rounded-l-xl bg-card duration-(--sheet-motion-duration) ease-(--sheet-motion-easing) motion-reduce:duration-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[383px]";

// Equal actions when they fit; long confirmation labels wrap as whole buttons.
export const employeeSheetFooterClassName =
  "mt-auto flex shrink-0 flex-row flex-wrap gap-2 bg-card p-4 *:min-w-max *:flex-1 *:basis-[calc((100%-0.5rem)/2)]";

export function EmployeeCardButton({ className, title, tooltipSide, ...props }: ComponentProps<typeof Button> & { tooltipSide?: "right" | "bottom" }) {
  const button = <Button {...props} size="default" className={cn(employeeCardButtonSize, className)} />;
  return title ? <EmployeeTooltip label={title} side={tooltipSide}>{button}</EmployeeTooltip> : button;
}
