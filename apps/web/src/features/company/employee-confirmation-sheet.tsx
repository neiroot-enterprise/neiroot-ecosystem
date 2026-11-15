import { useRef, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { EmployeeCardButton } from "./employee-card-ui";

export function EmployeeConfirmationSheet({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  destructive = false,
  confirmVariant,
  pending = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  confirmVariant?: "outline";
  pending?: boolean;
  children?: ReactNode;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        size="sm"
        onBackdropClick={() => { if (!pending) onOpenChange(false); }}
        initialFocus={cancel}
        className="w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-6">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <EmployeeCardButton
            ref={cancel}
            className="h-auto min-h-8 min-w-0 whitespace-normal py-1"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </EmployeeCardButton>
          <EmployeeCardButton
            className="h-auto min-h-8 min-w-0 whitespace-normal py-1"
            variant={confirmVariant ?? (destructive ? "destructive" : "default")}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </EmployeeCardButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
