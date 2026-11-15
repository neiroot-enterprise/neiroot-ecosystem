import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import "@fontsource-variable/geist";
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CircleAlert,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, canManage, type Tenant } from "@/shared/api/client";
import type { components } from "@/shared/api/schema.gen";
import { Busy, ErrorMessage } from "@/shared/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Item as ItemRow, ItemContent, ItemTitle } from "@/shared/ui/item";
import { EmployeeCardButton as Button, employeeSheetContentClassName, employeeSheetFooterClassName } from "./employee-card-ui";
import { cn } from "@/shared/lib/utils";
import { EmployeeConfirmationSheet } from "./employee-confirmation-sheet";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

type Assignment = components["schemas"]["AssignmentView"];
type AssignedDepartment = {
  id: string;
  name: string;
  archived: boolean;
  children: AssignedDepartment[];
};
type Reference = components["schemas"]["AssignmentReference"];
type Changes = components["schemas"]["UpdateEmployeeAssignmentsInput"];
type Item = components["schemas"]["CatalogItem"];
type ItemList = components["schemas"]["CatalogList"];
type Selection = Map<string, Reference>;
type Dirty = (value: boolean) => void;

const targetKey = (assignment: {
  businessId: string;
  departmentId?: string | null;
}) => `${assignment.businessId}:${assignment.departmentId || ""}`;
const root = (tenant: Tenant) => `/api/v1/tenants/${tenant.id}`;
function useCatalog<T>(tenant: Tenant, path: string) {
  return useQuery({
    queryKey: ["catalog", tenant.id, path],
    queryFn: () => api<T>(root(tenant) + path),
  });
}
function RetryError({ error, retry }: { error: unknown; retry: () => void }) {
  return error ? (
    <div className="space-y-2">
      <ErrorMessage error={error} />
      <Button type="button" variant="outline" onClick={retry}>
        Повторить
      </Button>
    </div>
  ) : null;
}

function AssignmentTree({ items }: { items: AssignedDepartment[] }) {
  return (
    <ul className="employee-assignment-tree">
      {items.map((item) => (
        <li className="employee-assignment-node" key={item.id}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
            {item.archived && <Badge variant="secondary">Архив</Badge>}
          </div>
          {item.children.length > 0 && <AssignmentTree items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

export function EmployeeAssignments({
  tenant,
  id,
  onDirty,
}: {
  tenant: Tenant;
  id: string;
  onDirty: Dirty;
}) {
  const query = useCatalog<components["schemas"]["AssignmentList"]>(
    tenant,
    `/employees/${id}/assignments?status=all`,
  );
  const [editing, setEditing] = useState<Assignment[]>();
  const editButton = useRef<HTMLButtonElement>(null);
  const groups = new Map<
    string,
    { membership?: Assignment; departments: Assignment[] }
  >();
  for (const assignment of query.data?.items || []) {
    const group = groups.get(assignment.businessId) || { departments: [] };
    if (assignment.departmentId) group.departments.push(assignment);
    else group.membership = assignment;
    groups.set(assignment.businessId, group);
  }
  const departmentQueries = useQueries({
    queries: [...groups].map(([businessId, group]) => ({
      queryKey: ["catalog", tenant.id, `/businesses/${businessId}/departments?status=all`],
      queryFn: () =>
        api<ItemList>(
          root(tenant) + `/businesses/${businessId}/departments?status=all`,
        ),
      enabled: !!query.data && group.departments.length > 0,
    })),
  });
  return (
    <Card
      role="region"
      aria-labelledby="employee-assignments-title"
      className="employee-assignments gap-2"
    >
      <CardHeader>
        <CardTitle>
          <h2 id="employee-assignments-title">Предприятия и отделы</h2>
        </CardTitle>
        {canManage(tenant.role) && (
          <CardAction className="row-span-1 flex h-0 items-center self-center">
            <Button
              ref={editButton}
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
              disabled={!query.data || query.isFetching || !!query.error}
              onClick={() => {
                setEditing([...(query.data?.items || [])]);
              }}
            >
              Изменить
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <RetryError error={query.error} retry={() => void query.refetch()} />
        {query.isPending ? (
          <Busy />
        ) : query.data && !query.data.items.length ? (
          <p className="text-sm text-muted-foreground">
            Сотрудник не назначен ни в одно предприятие.
          </p>
        ) : (
          <ul role="list" className="space-y-2">
            {[...groups].map(([businessId, group], groupIndex) => {
              const membership = group.membership || group.departments[0];
              const catalog = departmentQueries[groupIndex]?.data?.items || [];
              const catalogById = new Map(catalog.map((item) => [item.id, item]));
              const assignedById = new Map(
                group.departments.map((item) => [
                  item.departmentId!,
                  {
                    id: item.departmentId!,
                    name: item.departmentName,
                    archived: item.archived,
                    children: [] as AssignedDepartment[],
                  },
                ]),
              );
              const roots: AssignedDepartment[] = [];
              const ordered = [...group.departments].sort((a, b) => {
                const ai = catalog.findIndex((item) => item.id === a.departmentId);
                const bi = catalog.findIndex((item) => item.id === b.departmentId);
                return ai - bi;
              });
              for (const assignment of ordered) {
                const node = assignedById.get(assignment.departmentId!)!;
                let parentId =
                  catalogById.get(assignment.departmentId!)?.parentId || null;
                let assignedParent: AssignedDepartment | undefined;
                const seen = new Set<string>();
                while (parentId && !seen.has(parentId)) {
                  seen.add(parentId);
                  assignedParent = assignedById.get(parentId);
                  if (assignedParent) break;
                  parentId = catalogById.get(parentId)?.parentId || null;
                }
                if (assignedParent) assignedParent.children.push(node);
                else roots.push(node);
              }
              return (
                <li key={businessId}>
                  <ItemRow className="border-0 p-0">
                    <ItemContent className="min-w-0 gap-0">
                      <ItemTitle className="line-clamp-none w-auto min-w-0 leading-5">
                        <Link
                          className="-mx-1 min-w-0 rounded-sm px-1 text-primary no-underline [overflow-wrap:anywhere] hover:bg-accent hover:text-accent-foreground hover:no-underline focus-visible:bg-accent focus-visible:outline-ring"
                          to={`/company/businesses/${businessId}`}
                        >
                          {membership.businessName}
                        </Link>
                        {group.membership?.archived && (
                          <Badge variant="secondary">Архив</Badge>
                        )}
                      </ItemTitle>
                      {group.departments.length ? (
                        <AssignmentTree items={roots} />
                      ) : (
                        <p className="employee-assignment-empty">
                          <span className="sr-only">Без привязки к отделу</span>
                        </p>
                      )}
                    </ItemContent>
                  </ItemRow>
                </li>
              );
            })}
          </ul>
        )}
        {canManage(tenant.role) && (
          <AssignmentEditor
            active={editing !== undefined}
            tenant={tenant}
            employeeId={id}
            initial={editing || []}
            returnFocus={editButton}
            onDirty={onDirty}
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentEditor({
  active,
  tenant,
  employeeId,
  initial,
  returnFocus,
  onDirty,
  onClose,
  onSaved,
}: {
  active: boolean;
  tenant: Tenant;
  employeeId: string;
  initial: Assignment[];
  returnFocus: RefObject<HTMLButtonElement | null>;
  onDirty: Dirty;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const saved = useRef(false);
  const [original, setOriginal] = useState<Selection>(
    () =>
      new Map(
        initial.map((assignment) => [
          targetKey(assignment),
          {
            businessId: assignment.businessId,
            departmentId: assignment.departmentId || null,
          },
        ]),
      ),
  );
  const [selected, setSelected] = useState<Selection>(() => new Map(original));
  const [search, setSearch] = useState("");
  const scrollArea = useRef<HTMLDivElement>(null);
  const loadMore = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["catalog", tenant.id, "employee-assignment-businesses", search],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api<ItemList>(
      `${root(tenant)}/businesses?status=all&limit=25&offset=${pageParam}&search=${encodeURIComponent(search)}`,
      { signal },
    ),
    getNextPageParam: (page, _pages, offset) => {
      const next = offset + page.items.length;
      return page.items.length > 0 && next < page.total ? next : undefined;
    },
    enabled: open,
  });
  const businesses = [...new Map(
    (query.data?.pages.flatMap(page => page.items) || []).map(item => [item.id, item]),
  ).values()];
  const total = query.data?.pages[0]?.total || 0;
  useEffect(() => {
    scrollArea.current?.scrollTo({ top: 0 });
  }, [search]);
  useEffect(() => {
    const area = scrollArea.current;
    const sentinel = loadMore.current;
    if (!open || !area || !sentinel || !query.hasNextPage || query.isFetching || query.isFetchNextPageError) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void query.fetchNextPage();
    }, { root: area, rootMargin: "0px 0px 160px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, query.hasNextPage, query.isFetching, query.isFetchNextPageError, query.fetchNextPage, businesses.length]);
  const changes: Changes = {
    add: [...selected]
      .filter(([key]) => !original.has(key))
      .map(([, assignment]) => assignment),
    remove: [...original]
      .filter(
        ([key, assignment]) =>
          !selected.has(key) &&
          (!assignment.departmentId ||
            selected.has(targetKey({ businessId: assignment.businessId }))),
      )
      .map(([, assignment]) => assignment),
  };
  const dirty = changes.add.length > 0 || changes.remove.length > 0;
  const mutation = useMutation({
    mutationFn: () =>
      api<void>(`${root(tenant)}/employees/${employeeId}/assignments`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      }),
    onSuccess: async () => {
      onDirty(false);
      await client.invalidateQueries({ queryKey: ["catalog", tenant.id] });
      saved.current = true;
      setOpen(false);
    },
  });
  useEffect(() => {
    if (!active) return;
    const selection = new Map(initial.map(assignment => [targetKey(assignment), {
      businessId: assignment.businessId,
      departmentId: assignment.departmentId || null,
    }]));
    setOriginal(selection);
    setSelected(new Map(selection));
    setSearch("");
    scrollArea.current?.scrollTo({ top: 0 });
    setExpanded(new Set());
    setConfirmClose(false);
    saved.current = false;
    mutation.reset();
    setOpen(true);
  }, [active, initial]);
  useEffect(() => {
    onDirty(open && dirty);
    return () => onDirty(false);
  }, [open, dirty, onDirty]);
  const requestClose = () => {
    if (mutation.isPending) return;
    if (dirty) setConfirmClose(true);
    else setOpen(false);
  };
  const toggle = (
    businessId: string,
    departmentId: string | null,
    checked: boolean,
  ) =>
    setSelected((previous) => {
      const next = new Map(previous);
      const target = { businessId, departmentId };
      if (checked) {
        next.set(targetKey({ businessId }), { businessId, departmentId: null });
        next.set(targetKey(target), target);
        for (const assignment of initial)
          if (
            assignment.businessId === businessId &&
            assignment.departmentId &&
            assignment.archived
          )
            next.set(targetKey(assignment), {
              businessId,
              departmentId: assignment.departmentId,
            });
      } else if (departmentId) next.delete(targetKey(target));
      else
        for (const [key, assignment] of next)
          if (assignment.businessId === businessId) next.delete(key);
      return next;
    });
  const removed = changes.remove.filter(
    (assignment) => !assignment.departmentId,
  );
  const removedBusinessKey = removed.map((assignment) => assignment.businessId).sort().join(",");
  const [showRemovalWarning, setShowRemovalWarning] = useState(false);
  useEffect(() => {
    setShowRemovalWarning(open && removedBusinessKey.length > 0);
    if (!open || !removedBusinessKey) return;
    const timeout = window.setTimeout(() => setShowRemovalWarning(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [open, removedBusinessKey]);
  const selectedBusinesses = [...selected.values()].filter(
    (assignment) => !assignment.departmentId,
  ).length;
  return (
    <>
      <Sheet
        open={open}
        onOpenChangeComplete={(next) => {
          if (!next) {
            if (saved.current) onSaved();
            else onClose();
          }
        }}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <SheetContent showCloseButton={false} keepMounted side="right" finalFocus={returnFocus} className={cn(employeeSheetContentClassName, "overflow-hidden")}>
          <SheetHeader className="shrink-0 gap-2 pb-0">
            <SheetTitle className="text-center leading-6">Предприятия и отделы сотрудника</SheetTitle>
            <SheetDescription>
              Отметьте предприятия и отделы. Выбор отдела автоматически
              добавляет сотрудника в предприятие.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (dirty && !mutation.isPending) mutation.mutate();
            }}
          >
            <ScrollArea
              className="min-h-0 flex-1"
              contentClassName="space-y-4 px-4 pb-4"
              viewportProps={{ ref: scrollArea, role: "region", "aria-label": "Список предприятий" }}
            >
              <Field>
                <FieldLabel htmlFor="assignment-search">
                  Поиск предприятий
                </FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="assignment-search"
                    autoFocus
                    className="h-8 py-1 pl-9 text-sm"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                  />
                </div>
                <FieldDescription>
                  Выбрано предприятий: {selectedBusinesses} · отделов:{" "}
                  {selected.size - selectedBusinesses}
                </FieldDescription>
              </Field>
              <RetryError
                error={query.isFetchNextPageError ? null : query.error}
                retry={() => void query.refetch()}
              />
              {query.isPending ? (
                <Busy />
              ) : (
                query.data && (
                  <>
                    <div className="space-y-2">
                      {businesses.map((business) => (
                        <BusinessChoice
                          key={business.id}
                          tenant={tenant}
                          business={business}
                          selected={selected}
                          expanded={expanded.has(business.id)}
                          saving={mutation.isPending}
                          onExpanded={(open) =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (open) next.add(business.id);
                              else next.delete(business.id);
                              return next;
                            })
                          }
                          onToggle={toggle}
                        />
                      ))}
                      {!businesses.length && (
                        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                          {search
                            ? "Предприятия не найдены"
                            : "Предприятий пока нет"}
                        </div>
                      )}
                    </div>
                    {query.hasNextPage && <div ref={loadMore} aria-hidden="true" className="h-px" />}
                    {query.isFetchingNextPage && <p role="status" className="text-sm text-muted-foreground">Загружаем предприятия…</p>}
                    {query.isFetchNextPageError && <RetryError error={query.error} retry={() => void query.fetchNextPage()} />}
                    <p className="text-sm text-muted-foreground">Всего: {total}</p>
                  </>
                )
              )}
            </ScrollArea>
            {((showRemovalWarning && removed.length > 0) || mutation.error != null) && (
            <ScrollArea
              className="max-h-[30svh] shrink-0"
              contentClassName="px-4"
              viewportProps={{ role: "region", "aria-label": "Сообщения о назначениях" }}
            >
            {showRemovalWarning && !!removed.length && (
              <Alert
                role="note"
                variant="destructive"
                className="mb-4 font-['Geist_Variable',sans-serif]"
              >
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Сотрудник будет исключён</AlertTitle>
                <AlertDescription>
                  Предприятия:{" "}
                  {removed
                    .map(
                      (assignment) =>
                        initial.find(
                          (item) => item.businessId === assignment.businessId,
                        )?.businessName || "Предприятие",
                    )
                    .join(", ")}
                  . Все назначения в их отделах, включая архивные, будут сняты.
                  Карточка сотрудника сохранится.
                </AlertDescription>
              </Alert>
            )}
            <ErrorMessage
              error={mutation.error}
              className="mb-4 font-['Geist_Variable',sans-serif]"
            />
            </ScrollArea>
            )}
            <SheetFooter className={employeeSheetFooterClassName}>
              <Button type="submit" disabled={!dirty || mutation.isPending}>
                {mutation.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={requestClose}
              >
                Отмена
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <EmployeeConfirmationSheet
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Отменить изменения?"
        description="Несохранённые назначения будут потеряны."
        cancelLabel="Продолжить"
        confirmLabel="Отменить"
        confirmVariant="outline"
        onConfirm={() => {
          onDirty(false);
          setConfirmClose(false);
          setOpen(false);
        }}
      />
    </>
  );
}

function BusinessChoice({
  tenant,
  business,
  selected,
  expanded,
  saving,
  onExpanded,
  onToggle,
}: {
  tenant: Tenant;
  business: Item;
  selected: Selection;
  expanded: boolean;
  saving: boolean;
  onExpanded: (open: boolean) => void;
  onToggle: (
    businessId: string,
    departmentId: string | null,
    checked: boolean,
  ) => void;
}) {
  const checked = selected.has(targetKey({ businessId: business.id }));
  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpanded}
      className="rounded-xl border"
    >
      <div className="flex items-center gap-3 p-3">
        <Checkbox
          id={`business-${business.id}`}
          checked={checked}
          disabled={saving || business.archived}
          onCheckedChange={(value) =>
            onToggle(business.id, null, value === true)
          }
        />
        <label
          htmlFor={`business-${business.id}`}
          className="min-w-0 flex-1 cursor-pointer font-medium [overflow-wrap:anywhere]"
        >
          {business.name}
        </label>
        {business.archived && <Badge variant="secondary">Архив</Badge>}
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="default"
              aria-label={`Отделы предприятия «${business.name}»`}
            />
          }
        >
          Отделы
          <ChevronDown
            data-icon="inline-end"
            className={
              expanded
                ? "rotate-180 transition-transform"
                : "transition-transform"
            }
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <DepartmentChoices
          tenant={tenant}
          business={business}
          selected={selected}
          saving={saving}
          onToggle={onToggle}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function DepartmentChoices({
  tenant,
  business,
  selected,
  saving,
  onToggle,
}: {
  tenant: Tenant;
  business: Item;
  selected: Selection;
  saving: boolean;
  onToggle: (
    businessId: string,
    departmentId: string | null,
    checked: boolean,
  ) => void;
}) {
  const query = useCatalog<ItemList>(
    tenant,
    `/businesses/${business.id}/departments?status=all`,
  );
  const children = new Map<string, Item[]>();
  for (const department of query.data?.items || []) {
    const key = department.parentId || "";
    const list = children.get(key) || [];
    list.push(department);
    children.set(key, list);
  }
  for (const list of children.values())
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  type TreeRow = {
    item: Item;
    depth: number;
    last: boolean;
    guides: number[];
    hasChildren: boolean;
  };
  const rows: TreeRow[] = [];
  const roots = children.get("") || [];
  const stack = roots
    .map((item, index) => ({ item, depth: 0, last: index === roots.length - 1, guides: [] as number[] }))
    .reverse();
  while (stack.length) {
    const row = stack.pop()!;
    const descendants = children.get(row.item.id) || [];
    rows.push({ ...row, hasChildren: descendants.length > 0 });
    for (let index = descendants.length - 1; index >= 0; index--)
      stack.push({
        item: descendants[index],
        depth: row.depth + 1,
        last: index === descendants.length - 1,
        guides: row.depth > 0 && !row.last ? [...row.guides, row.depth] : row.guides,
      });
  }
  return (
    <div className="space-y-2 border-t bg-muted/20 p-3">
      <RetryError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Busy className="min-h-16" />
      ) : query.data && !rows.length ? (
        <p className="text-sm text-muted-foreground">Отделов пока нет</p>
      ) : (
        <div className="overflow-x-auto">
        <ul
          aria-label={`Отделы предприятия «${business.name}»`}
          className="min-w-[calc(13.75rem+var(--max-depth)*var(--department-indent))] [--department-indent:1rem] md:[--department-indent:1.5rem]"
          style={{ "--max-depth": rows.reduce((max, row) => Math.max(max, row.depth), 0) } as CSSProperties}
        >
        {rows.map(({ item: department, depth, last, guides, hasChildren }) => {
          const archived = business.archived || department.effectiveArchived;
          const style = { "--tree-depth": depth } as CSSProperties;
          return (
            <li
              key={department.id}
              style={style}
              className="relative py-1"
            >
              {guides.map(level => (
                <span
                  key={level}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 border-l border-(--color-control-hover)"
                  style={{ left: `calc((${level} - 0.5) * var(--department-indent))` }}
                />
              ))}
              {depth > 0 && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[calc((var(--tree-depth)-0.5)*var(--department-indent))] w-[calc(var(--department-indent)/2)]">
                  <span className={cn("absolute top-0 border-l border-(--color-control-hover)", last ? "bottom-1/2" : "bottom-0")} />
                  <span className="absolute inset-x-0 top-1/2 border-t border-(--color-control-hover)" />
                </span>
              )}
              {hasChildren && (
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 bottom-0 left-[calc((var(--tree-depth)+0.5)*var(--department-indent))] border-l border-(--color-control-hover)" />
              )}
              <div className="relative ml-[calc(var(--tree-depth)*var(--department-indent))] flex min-h-9 items-center gap-3 rounded-lg border bg-card px-3">
              <Checkbox
                id={`department-${department.id}`}
                checked={selected.has(
                  targetKey({
                    businessId: business.id,
                    departmentId: department.id,
                  }),
                )}
                disabled={saving || archived}
                onCheckedChange={(value) =>
                  onToggle(business.id, department.id, value === true)
                }
              />
              <label
                htmlFor={`department-${department.id}`}
                className="min-w-0 flex-1 cursor-pointer text-sm [overflow-wrap:anywhere]"
              >
                {department.name}
              </label>
              {archived && <Badge variant="secondary">Архив</Badge>}
              </div>
            </li>
          );
        })}
        </ul>
        </div>
      )}
    </div>
  );
}
