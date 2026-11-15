import type { ComponentProps } from "react";
import { roleNames } from "@/shared/api/client";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/combobox";

const roleOptions = [
  { value: "user" as const, label: roleNames.user },
  { value: "admin" as const, label: roleNames.admin },
];

export function EmployeeRolePicker({
  id, value, onValueChange, disabled, onBlur, inputRef,
}: {
  id: string;
  value: "user" | "admin";
  onValueChange: (value: "user" | "admin") => void;
  disabled?: boolean;
  onBlur?: ComponentProps<typeof ComboboxInput>["onBlur"];
  inputRef?: ComponentProps<typeof ComboboxInput>["ref"];
}) {
  return (
    <Combobox<(typeof roleOptions)[number]>
      disabled={disabled}
      items={roleOptions}
      value={roleOptions.find((item) => item.value === value)}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      onInputValueChange={(_, details) => {
        if (details.reason === "escape-key") details.cancel();
      }}
      onValueChange={(item, details) => {
        if (item) onValueChange(item.value);
        else details.cancel();
      }}
    >
      <ComboboxInput
        id={id}
        ref={inputRef}
        onBlur={onBlur}
        aria-label="Роль в экосистеме"
        placeholder="Выберите роль"
        className="w-full [&_input]:font-medium [&_input]:text-foreground has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/50"
      />
      <ComboboxContent>
        <ComboboxEmpty>Роли не найдены</ComboboxEmpty>
        <ComboboxList className="space-y-px">
          {(item: (typeof roleOptions)[number]) => (
            <ComboboxItem
              key={item.value}
              value={item}
              className="data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-accent data-selected:text-accent-foreground"
            >
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
