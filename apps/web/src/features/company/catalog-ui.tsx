import { createContext, useContext, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Card } from '@/shared/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/shared/ui/alert-dialog';
import { Modal as LegacyModal } from '@/shared/ui/components';

// The two catalog routes share behavior; both use the shared presentation.
export const ModernCatalog = createContext(false);
export function CatalogButton({ className = '', ...props }: ComponentProps<'button'>) {
  const modern = useContext(ModernCatalog);
  if (!modern) return <button className={className} {...props} />;
  return <Button size={className.includes('icon-button') ? 'icon-sm' : 'sm'}
    variant={className.includes('primary') ? 'default' : className.includes('danger') ? 'destructive' : className.includes('icon-button') ? 'ghost' : 'outline'}
    className={className.replace(/\b(button|primary|danger|icon-button)\b/g, '')} type="submit" {...props} />;
}
export function CatalogInput(props: ComponentProps<'input'>) {
  return useContext(ModernCatalog) ? <Input {...props} className="h-8 px-2 text-sm font-medium" /> : <input {...props} />;
}
export function CatalogPanel({ size, ...props }: ComponentProps<typeof Card>) {
  return useContext(ModernCatalog) ? <Card size={size} {...props} /> : <div {...props} />;
}
export function CatalogModal({ title, children, onClose, confirmation = false }: {
  title: string; children: ReactNode; onClose: () => void; confirmation?: boolean;
}) {
  const modern = useContext(ModernCatalog);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { returnFocus.current = document.activeElement as HTMLElement; }, []);
  if (!modern) return <LegacyModal title={title} onClose={onClose}>{children}</LegacyModal>;
  if (confirmation) return <AlertDialog open onOpenChange={open => { if (!open) onClose(); }}>
    <AlertDialogContent size="sm" className="enterprise-ui max-w-[calc(100%-2rem)] text-sm" finalFocus={returnFocus}
      initialFocus={() => document.querySelector<HTMLButtonElement>('[data-slot="alert-dialog-content"] button:last-child')}>
      <AlertDialogTitle className="pr-6 leading-6">{title}</AlertDialogTitle>{children}
    </AlertDialogContent>
  </AlertDialog>;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="enterprise-ui max-h-[90svh] overflow-y-auto sm:max-w-lg" finalFocus={returnFocus}>
      <DialogHeader><DialogTitle className="pr-6 leading-6">{title}</DialogTitle></DialogHeader>{children}
    </DialogContent>
  </Dialog>;
}
