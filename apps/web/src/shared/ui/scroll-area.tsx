import type { ComponentProps, ReactNode } from "react";
import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import { cn } from "@/shared/lib/utils";

type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  viewportProps?: ComponentProps<typeof Primitive.Viewport>;
};

export function ScrollArea({ children, className, contentClassName, viewportProps }: ScrollAreaProps) {
  return (
    <Primitive.Root data-slot="scroll-area" className={cn("relative flex flex-col", className)}>
      <Primitive.Viewport
        data-slot="scroll-area-viewport"
        className="min-h-0 flex-auto outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        {...viewportProps}
      >
        <Primitive.Content className={contentClassName} style={{ minWidth: 0 }}>
          {children}
        </Primitive.Content>
      </Primitive.Viewport>
      <Primitive.Scrollbar
        data-slot="scroll-area-scrollbar"
        orientation="vertical"
        className="flex w-3 touch-none select-none px-[3px] py-px"
      >
        <Primitive.Thumb className="flex-1 rounded-full bg-muted-foreground/40" />
      </Primitive.Scrollbar>
    </Primitive.Root>
  );
}
