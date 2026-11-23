import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Copy,
  LoaderCircle,
  MoreHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      <img
        className="h-5 w-auto dark:hidden"
        src="/neiroot-wordmark.png?v=20261005-2"
        alt="NEIROOT"
      />
      <img
        className="hidden h-5 w-auto dark:block"
        src="/neiroot-wordmark-dark.png?v=20261109-2"
        alt="NEIROOT"
      />
    </div>
  );
}

export function Busy({
  text = "Загрузка…",
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      {text}
    </div>
  );
}

export function ErrorMessage({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className={className}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>
        {error instanceof Error
          ? error.message
          : "Не удалось загрузить данные."}
      </AlertDescription>
    </Alert>
  );
}

export function ActionsMenu({
  label,
  actions,
}: {
  label: string;
  actions: {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="department-menu-trigger"
            aria-label={label}
            title={label}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" aria-label={label}>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.danger ? "destructive" : "default"}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvitationLink({
  url,
  variant = "panel",
  expiresAt,
  actions,
  showTitle = true,
  standardButton = false,
  buttonClassName,
  hideActions = false,
}: {
  url: string;
  variant?: "panel" | "inline";
  expiresAt?: string;
  actions?: ReactNode;
  showTitle?: boolean;
  standardButton?: boolean;
  buttonClassName?: string;
  hideActions?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCopied(false);
    setError("");
  }, [url]);
  return (
    <div
      className={cn(
        variant === "inline" ? "space-y-2" : "space-y-3",
        variant === "panel" && "rounded-xl border bg-muted/35 p-4",
      )}
    >
      {!hideActions && <div>
        {showTitle && <p className="font-medium">Ссылка приглашения</p>}
        <p className={cn("text-sm text-muted-foreground", showTitle && "mt-1")}>
          Передайте персональную ссылку сотруднику. {expiresAt
            ? `Действует до ${new Date(expiresAt).toLocaleString("ru-RU")}.`
            : "Она действует 7 дней."}
        </p>
      </div>}
      <div className={cn(standardButton && !hideActions && "flex min-w-0 items-start rounded-lg border border-input bg-card has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/50")}>
      <Textarea
        aria-label="Ссылка приглашения"
        value={url}
        readOnly
        rows={hideActions ? 2 : 3}
        className={cn("resize-none bg-card font-mono text-xs", standardButton && !hideActions && "min-w-0 flex-1 border-0 bg-transparent focus-visible:ring-0", hideActions && "min-h-12 text-foreground focus-visible:border-input focus-visible:ring-0")}
      />
      {!hideActions && (
      <div className={cn(standardButton ? "flex shrink-0 items-center gap-0.5 p-1" : "flex items-stretch gap-2")}>
      <Button
        type="button"
        size={standardButton ? "icon-sm" : "default"}
        variant={standardButton ? "ghost" : "default"}
        aria-label={copied ? "Скопировано" : "Копировать ссылку"}
        title={standardButton ? (copied ? "Скопировано" : "Копировать ссылку") : undefined}
        className={cn(standardButton ? "size-8" : "h-auto min-h-9 min-w-0 shrink whitespace-normal py-2", !standardButton && buttonClassName)}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setError("");
          } catch {
            setError("Выделите и скопируйте ссылку вручную.");
          }
        }}
      >
        {copied
          ? <CheckCircle2 data-icon={standardButton ? "inline-start" : undefined} />
          : <Copy data-icon={standardButton ? "inline-start" : undefined} />}
        <span className={standardButton ? "sr-only" : undefined}>
          {copied ? "Скопировано" : "Копировать ссылку"}
        </span>
      </Button>
      {actions}
      </div>
      )}
      </div>
      {hideActions && <p className="text-sm leading-normal font-normal italic text-muted-foreground">* {expiresAt ? `Действует до ${new Date(expiresAt).toLocaleString("ru-RU")}.` : "Действует 7 дней."}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
