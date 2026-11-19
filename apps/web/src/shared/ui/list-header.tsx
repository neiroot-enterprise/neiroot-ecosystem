import { Search } from 'lucide-react';
import { CardAction, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import type { ReactNode } from 'react';

/** Shared heading and search layout for standalone lists. */
export function ListHeader({ title, description, search, searchLabel, placeholder, onSearchChange, filters, tableActions }: {
  title: string;
  description: string;
  search: string;
  searchLabel: string;
  placeholder: string;
  onSearchChange: (value: string) => void;
  filters?: ReactNode;
  tableActions?: ReactNode;
}) {
  const searchField = <div className="relative">
    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input className="h-8 py-1 pl-9" aria-label={searchLabel} placeholder={placeholder} value={search}
      onChange={event => onSearchChange(event.target.value)} />
  </div>;
  if (filters) return <CardHeader className="grid-cols-1! border-b lg:grid-cols-[minmax(0,1fr)_auto]!">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <CardAction className="col-start-1 row-span-1 row-start-3 w-full pt-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-auto lg:self-center lg:pt-0">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[20rem_auto]" role="group" aria-label="Поиск и фильтры">
          {searchField}
          {filters}
        </div>
      </CardAction>
  </CardHeader>;
  return <CardHeader className="grid-cols-1! border-b sm:grid-cols-[1fr_auto]!">
    <CardTitle>{title}</CardTitle>
    <CardDescription>{description}</CardDescription>
    <CardAction className="col-start-1 row-span-1 row-start-3 w-full pt-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:w-auto sm:self-center sm:pt-0">
      <div className="flex gap-2 sm:[&>*:first-child]:w-80 [&>*:first-child]:min-w-0 max-sm:[&>*:first-child]:flex-1">
        {searchField}
        {tableActions}
      </div>
    </CardAction>
  </CardHeader>;
}
