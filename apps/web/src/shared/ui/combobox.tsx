import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({
  className,
  icon,
  ...props
}: ComboboxPrimitive.Input.Props & { icon?: ReactNode }) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="input-group"
      className={cn(
        "relative flex h-8 min-w-0 items-center rounded-lg border border-input transition-colors has-[input:focus-visible]:border-neutral-500 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-neutral-500/50 dark:bg-input/30",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="ml-2 shrink-0 text-muted-foreground"
        >
          {icon}
        </span>
      )}
      <ComboboxPrimitive.Input
        data-slot="input-group-control"
        className={cn(
          "h-full w-full min-w-0 flex-1 truncate bg-transparent py-1 pr-1.5 pl-2.5 text-base outline-none placeholder:text-muted-foreground md:text-sm",
          icon && "pl-1.5",
        )}
        {...props}
      />
      <ComboboxPrimitive.Trigger
        aria-label="Показать варианты"
        data-slot="combobox-trigger"
        className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <ChevronDown aria-hidden="true" className="size-4" />
      </ComboboxPrimitive.Trigger>
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  align = "start",
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        className="isolate z-50"
        align={align}
        sideOffset={6}
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className="group/combobox-content w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      className={cn(
        "max-h-[min(18rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ children, className, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-none select-none data-highlighted:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <Check aria-hidden="true" className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty(props: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      className="hidden px-2 py-2 text-sm text-muted-foreground group-data-empty/combobox-content:block"
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
};
