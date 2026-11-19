import { Bell } from "lucide-react";
import type { Session } from "@/shared/api/client";
import { formatPhone } from "@/shared/lib/phone";
import { demoProfileAvatarSrc, isLocalPreview } from "@/shared/lib/local-preview";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Card, CardContent } from "@/shared/ui/card";
import { initials, PersonCardHeader, PersonalDataCard, PersonalDataField, PersonalDataValue } from "@/shared/ui/person-card";

export const profilePath = "/account/profile";
export const notificationsPath = "/account/notifications";

export function ProfilePage({ account }: {
  account: Extract<Session, { authenticated: true }>;
}) {
  const name = account.fullName.trim() || "Профиль";
  const hasNameParts = Boolean(account.lastName?.trim() || account.firstName?.trim());

  return (
    <section aria-label="Профиль" className="mx-auto max-w-3xl space-y-5">
      <PersonCardHeader name={name} avatar={
        <Avatar size="lg" aria-hidden="true">
          {isLocalPreview && <AvatarImage src={demoProfileAvatarSrc} alt="" />}
          <AvatarFallback className="bg-primary/10 text-primary">{initials(name)}</AvatarFallback>
        </Avatar>
      } />
      <PersonalDataCard>
        <dl className="min-w-0 space-y-2">
          {hasNameParts ? (
            <>
              <PersonalDataField label="Фамилия"><PersonalDataValue value={account.lastName} /></PersonalDataField>
              <PersonalDataField label="Имя"><PersonalDataValue value={account.firstName} /></PersonalDataField>
            </>
          ) : (
            <PersonalDataField label="ФИО"><PersonalDataValue value={account.fullName} /></PersonalDataField>
          )}
        </dl>
        <dl className="min-w-0 space-y-2">
          <PersonalDataField label="Телефон">
            <PersonalDataValue value={account.phone ? formatPhone(account.phone) : undefined} />
          </PersonalDataField>
          <PersonalDataField label="Email"><PersonalDataValue value={account.email} /></PersonalDataField>
        </dl>
      </PersonalDataCard>
    </section>
  );
}

export function NotificationsPage() {
  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Уведомления</h1>
        <p className="mt-1 text-sm text-muted-foreground">События, связанные с вашей учётной записью</p>
      </div>
      <Card className="max-w-xl">
        <CardContent className="flex items-center gap-3 py-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Bell aria-hidden="true" className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">Лента уведомлений пока недоступна.</p>
        </CardContent>
      </Card>
    </section>
  );
}
