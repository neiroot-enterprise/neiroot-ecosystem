import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '@/shared/ui/button';
import { CardFooter } from '@/shared/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';

/** Controlled server pagination. Fetching, filtering and tenant state belong to the caller. */
export function ListPagination({ pageIndex, pageSize, pageCount, fetching = false, keepFooterVisible = false, pageSizeLabel, onPageChange, onPageSizeChange }: {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  fetching?: boolean;
  keepFooterVisible?: boolean;
  pageSizeLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const footer = useRef<HTMLDivElement>(null);
  const requestedPage = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (requestedPage.current !== pageIndex || fetching) return;
    requestedPage.current = null;
    footer.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [pageIndex, fetching]);
  const changePage = (page: number) => {
    if (keepFooterVisible) requestedPage.current = page;
    onPageChange(page);
  };
  return (
    <CardFooter ref={footer} className="flex flex-col gap-3 bg-muted/25 sm:flex-row sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Показывать</span>
        <Select value={String(pageSize)} onValueChange={value => { if (value !== null) onPageSizeChange(Number(value)); }}>
          <SelectTrigger size="sm" aria-label={pageSizeLabel} className="w-20">
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Страница {pageIndex + 1} из {Math.max(1, pageCount)}</span>
        <Tooltip>
          <TooltipTrigger delay={800} render={<Button variant="outline" size="icon-sm" aria-label="Предыдущая страница"
            disabled={pageIndex <= 0 || fetching} onClick={() => changePage(pageIndex - 1)}><ChevronLeft /></Button>} />
          <TooltipContent side="right">Предыдущая страница</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger delay={800} render={<Button variant="outline" size="icon-sm" aria-label="Следующая страница"
            disabled={pageIndex + 1 >= pageCount || fetching} onClick={() => changePage(pageIndex + 1)}><ChevronRight /></Button>} />
          <TooltipContent side="right">Следующая страница</TooltipContent>
        </Tooltip>
      </div>
    </CardFooter>
  );
}
