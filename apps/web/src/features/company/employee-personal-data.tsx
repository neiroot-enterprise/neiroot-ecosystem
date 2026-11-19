import { useRef, useState, type ReactNode } from "react";
import type { Employee } from "@/shared/api/client";
import { isLocalPreview } from "@/shared/lib/local-preview";
import { formatPhone } from "@/shared/lib/phone";
import { PersonalDataCard, PersonalDataField, PersonalDataValue } from "@/shared/ui/person-card";
import { Input } from "@/shared/ui/input";
import { EmployeeCardButton } from "./employee-card-ui";

const groups = [
  [["lastName", "Фамилия"], ["firstName", "Имя"], ["middleName", "Отчество"]],
  [["phone", "Телефон"], ["email", "Email"]],
] as const;

type FieldName = typeof groups[number][number][0];
type Values = Partial<Record<FieldName, string>>;

export function EmployeePersonalData({
  employee, children, roleDirty, saving, onSaveRole, onCancelRole,
}: {
  employee: Employee;
  children: ReactNode;
  roleDirty: boolean;
  saving: boolean;
  onSaveRole: () => Promise<void>;
  onCancelRole: () => void;
}) {
  const [previewValues, setPreviewValues] = useState<Values>({});
  const [changes, setChanges] = useState<Values>({});
  const lastInput = useRef<HTMLInputElement | null>(null);
  const dirty = Object.keys(changes).length > 0 || roleDirty;

  const original = (key: FieldName) =>
    previewValues[key] ?? (key === "phone" ? formatPhone(employee.phone) : employee[key] || "");

  const cancel = () => {
    setChanges({});
    onCancelRole();
    lastInput.current?.focus({ preventScroll: true });
  };
  const save = async () => {
    try {
      if (roleDirty) await onSaveRole();
      setPreviewValues(previous => ({ ...previous, ...changes }));
      setChanges({});
      lastInput.current?.focus({ preventScroll: true });
    } catch {
      // The role mutation renders its error and preserves the draft for retry.
    }
  };

  return (
    <PersonalDataCard actions={(isLocalPreview || roleDirty || saving) && (
      <div className="grid w-40 shrink-0 grid-cols-2 gap-1">
        {dirty && (
          <>
            <EmployeeCardButton type="button" variant="outline" className="h-6 px-2 text-xs" disabled={saving} onClick={cancel}>
              Отмена
            </EmployeeCardButton>
            <EmployeeCardButton type="button" variant="default" className="h-6 px-2 text-xs" disabled={saving} aria-busy={saving} onClick={() => void save()}>
              Сохранить
            </EmployeeCardButton>
          </>
        )}
      </div>
    )}>
      {groups.map(fields => (
        <dl key={fields[0][0]} className="min-w-0 space-y-2">
          {fields.map(([key, label]) => {
            const value = original(key);
            const id = `employee-personal-${key}`;
            return (
              <PersonalDataField key={key} label={label} htmlFor={isLocalPreview ? id : undefined}>
                {isLocalPreview ? (
                  <Input id={id} type={key === "phone" ? "tel" : key === "email" ? "email" : "text"}
                    disabled={saving}
                    value={changes[key] ?? value}
                    onKeyDown={event => {
                      if (dirty && !saving && event.key === "Escape") {
                        event.preventDefault();
                        cancel();
                      }
                    }}
                    onFocus={event => { lastInput.current = event.currentTarget; }}
                    onChange={event => {
                      const nextValue = event.currentTarget.value;
                      setChanges(previous => {
                        const next = { ...previous };
                        if (nextValue === value) delete next[key];
                        else next[key] = nextValue;
                        return next;
                      });
                    }}
                    className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  />
                ) : (
                  <PersonalDataValue value={value} />
                )}
              </PersonalDataField>
            );
          })}
          {fields === groups[1] && (
            <PersonalDataField label="Роль в экосистеме" htmlFor="employee-role">
              {children}
            </PersonalDataField>
          )}
        </dl>
      ))}
    </PersonalDataCard>
  );
}
