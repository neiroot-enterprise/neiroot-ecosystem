import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export function useTableColumns(table: string) {
  const key = `neiroot-table-columns:${table}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });

  function setHiddenColumns(next: string[]) {
    setHidden(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The current view still works when browser storage is unavailable.
    }
  }

  return { hidden, setHiddenColumns };
}

export function TableColumnMenu({ columns, hidden, setHiddenColumns }: {
  columns: readonly { id: string; label: string }[];
  hidden: string[];
  setHiddenColumns: (ids: string[]) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={
          <DropdownMenuTrigger render={
            <Button
              variant="outline"
              size="icon-sm"
              className="bg-card dark:hover:bg-muted"
              aria-label="Настроить столбцы"
            >
              <Settings2 />
            </Button>
          } />
        } />
        <TooltipContent>Настроить столбцы</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-max max-w-(--available-width)">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Столбцы</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map(({ id, label }) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={!hidden.includes(id)}
              closeOnClick={false}
              onCheckedChange={checked => setHiddenColumns(checked
                ? hidden.filter(column => column !== id)
                : [...hidden, id])}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
