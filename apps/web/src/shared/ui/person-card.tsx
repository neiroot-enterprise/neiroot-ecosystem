import { useId, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

export function initials(fullName: string) {
  return fullName.trim().split(/\s+/).slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "—";
}

export function PersonCardHeader({ name, avatar, children }: {
  name: string;
  avatar: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <div className="flex items-start gap-3 sm:items-center">
          {avatar}
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] md:text-3xl">
              {name}
            </h1>
            {children}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function PersonalDataCard({ actions, children }: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="gap-2">
      <CardHeader className="flex min-h-6 items-center justify-between gap-2">
        <CardTitle><h2 id={titleId}>Личные данные</h2></CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {children}
      </CardContent>
    </Card>
  );
}

export function PersonalDataField({ label, htmlFor, children }: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export function PersonalDataValue({ value }: { value?: string }) {
  return (
    <span className="flex min-h-8 items-center px-2 font-medium [overflow-wrap:anywhere]">
      {value || "—"}
    </span>
  );
}
