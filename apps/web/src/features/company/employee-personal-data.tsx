import { useRef, useState, type ReactNode } from "react";
import type { Employee } from "@/shared/api/client";
import { isLocalPreview } from "@/shared/lib/local-preview";
import { formatPhone } from "@/shared/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
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
    <Card role="region" aria-labelledby="employee-personal-title" className="gap-2">
      <CardHeader className="flex min-h-6 items-center justify-between gap-2">
        <CardTitle><h2 id="employee-personal-title">Личные данные</h2></CardTitle>
        {(isLocalPreview || roleDirty || saving) && (
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
        )}
      </CardHeader>
      <CardContent className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {groups.map(fields => (
          <dl key={fields[0][0]} className="min-w-0 space-y-2">
            {fields.map(([key, label]) => {
              const value = original(key);
              const id = `employee-personal-${key}`;
              return (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">
                    {isLocalPreview ? <label htmlFor={id}>{label}</label> : label}
                  </dt>
                  <dd className="mt-1">
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
                      <span className="flex min-h-8 items-center px-2 font-medium [overflow-wrap:anywhere]">{value || "—"}</span>
                    )}
                  </dd>
                </div>
              );
            })}
            {fields === groups[1] && (
              <div>
                <dt className="text-sm text-muted-foreground"><label htmlFor="employee-role">Роль в экосистеме</label></dt>
                <dd className="mt-1">{children}</dd>
              </div>
            )}
          </dl>
        ))}
      </CardContent>
    </Card>
  );
}
