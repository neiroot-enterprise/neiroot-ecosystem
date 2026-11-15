import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateAtom, useSelector } from "@tanstack/react-store";
import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type PaginationState,
} from "@tanstack/react-table";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  Phone,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  canManage,
  roleNames,
  type CreateEmployeeResult,
  type Employee,
  type EmployeeList,
  type Tenant,
} from "@/shared/api/client";
import { formatPhone, normalizePhone } from "@/shared/lib/phone";
import { cn } from "@/shared/lib/utils";
import { demoProfileAvatarSrc, isLocalPreview } from "@/shared/lib/local-preview";
import { Busy, ErrorMessage, InvitationLink } from "@/shared/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogTitle } from "@/shared/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button, buttonVariants } from "@/shared/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { EmployeeAvatarEditor } from "./employee-avatar-editor";
import { EmployeeTooltip } from "./employee-tooltip";
import { EmployeePersonalData } from "./employee-personal-data";
import { EmployeeRolePicker } from "./employee-role-picker";
import { EmployeeAssignments } from "./EmployeeAssignments";
import { EmployeeConfirmationSheet } from "./employee-confirmation-sheet";
import { EmployeeCardButton, employeeCardButtonSize } from "./employee-card-ui";

const tableFeatureSet = tableFeatures({ rowPaginationFeature });
const column = createColumnHelper<typeof tableFeatureSet, Employee>();
const emptyEmployees: Employee[] = [];


function initials(fullName: string) {
  return (
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "—"
  );
}

function employeeAvatarImage(employee: Employee) {
  const name = [employee.lastName?.trim(), employee.firstName?.trim()]
    .filter(Boolean)
    .join(" ");
  return isLocalPreview &&
    (name.toLowerCase() === "шматко никита" ||
      (!name && /^шматко\s+никита(?:\s|$)/i.test(employee.fullName.trim())));

}

function EmployeeAvatar({
  employee,
  size,
  className,
}: {
  employee: Employee;
  size?: "lg";
  className?: string;
}) {
  const showDemoAvatar = employeeAvatarImage(employee);

  return (
    <Avatar aria-hidden="true" size={size} className={className}>
      {showDemoAvatar && <AvatarImage src={demoProfileAvatarSrc} alt="" />}
      <AvatarFallback className="bg-primary/10 text-primary">
        {initials(employee.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

function AccessState({ employee }: { employee: Employee }) {
  let text = "Ожидает подключения";
  let variant: "default" | "secondary" | "destructive" | "outline" =
    "secondary";
  let className = "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
  if (employee.accessState === "active") {
    text = "Подключён";
    variant = "secondary";
    className = "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300";
  } else if (employee.invitationState === "expired") {
    text = "Ссылка истекла";
    variant = "destructive";
    className = "";
  } else if (employee.invitationState === "revoked") {
    text = "Приглашение отменено";
    variant = "secondary";
    className = "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
  } else if (employee.accessState === "error") {
    text = "Доступ не создан";
    variant = "destructive";
    className = "";
  }
  return (
    <Badge variant={variant} className={className}>
      {text}
    </Badge>
  );
}

function RoleBadge({ role }: { role: Employee["role"] }) {
  return (
    <Badge variant="secondary" className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
      {roleNames[role]}
    </Badge>
  );
}

const employeeColumns = column.columns([
  column.accessor("fullName", {
    header: "Сотрудник",
    cell: ({ row }) => (
      <Link
        className="flex min-w-0 items-center gap-3 font-medium hover:text-primary"
        to={`/company/employees/${row.original.id}`}
      >
        <EmployeeAvatar employee={row.original} />
        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{row.original.fullName}</span>
      </Link>
    ),
  }),
  column.accessor("phone", {
    header: "Телефон",
    cell: (info) => (
      <span className="block truncate text-muted-foreground">
        {formatPhone(String(info.getValue()))}
      </span>
    ),
  }),
  column.accessor("role", {
    header: "Роль",
    cell: (info) => <RoleBadge role={info.getValue() as Employee["role"]} />,
  }),
  column.display({
    id: "access",
    header: "Подключение",
    cell: ({ row }) => <AccessState employee={row.original} />,
  }),
  column.display({
    id: "open",
    header: "",
    cell: ({ row }) => (
      <EmployeeTooltip label="Открыть карточку">
      <Link
        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        aria-label={`Открыть карточку ${row.original.fullName}`}
        to={`/company/employees/${row.original.id}`}
      >
        <ArrowRight />
      </Link>
      </EmployeeTooltip>
    ),
  }),
]);

export function Employees({ tenant }: { tenant: Tenant }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const paginationAtom = useCreateAtom<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const pagination = useSelector(paginationAtom);
  useEffect(() => {
    setSearch("");
    setQuery("");
    paginationAtom.set({ pageIndex: 0, pageSize: 25 });
  }, [tenant.id, paginationAtom]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextQuery = search.trim();
      if (nextQuery === query) return;
      setQuery(nextQuery);
      paginationAtom.set((previous) => ({ ...previous, pageIndex: 0 }));
    }, 250);
    return () => clearTimeout(timer);
  }, [search, query, paginationAtom]);
  const scrollViewport = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const pendingScroll = useRef<number | undefined>(undefined);
  const pageKey = (pageIndex: number) => JSON.stringify([tenant.id, query, pagination.pageSize, pageIndex]);
  function changePage(pageIndex: number) {
    scrollPositions.current.set(pageKey(pagination.pageIndex), scrollViewport.current?.scrollTop ?? 0);
    pendingScroll.current = scrollPositions.current.get(pageKey(pageIndex)) ?? scrollViewport.current?.scrollTop ?? 0;
    paginationAtom.set((previous) => ({ ...previous, pageIndex }));
  }
  const offset = pagination.pageIndex * pagination.pageSize;
  const result = useQuery({
    queryKey: [
      "employees",
      tenant.id,
      query,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === tenant.id &&
      previousQuery.queryKey[4] === pagination.pageSize ? previous : undefined,
    queryFn: () =>
      api<EmployeeList>(
        `/api/v1/tenants/${tenant.id}/employees?limit=${pagination.pageSize}&offset=${offset}&search=${encodeURIComponent(query)}`,
      ),
  });
  useLayoutEffect(() => {
    if (!result.data || result.isPlaceholderData || pendingScroll.current === undefined) return;
    scrollViewport.current?.scrollTo({ top: pendingScroll.current, behavior: "instant" });
    pendingScroll.current = undefined;
  }, [result.data, result.isPlaceholderData]);
  const items = result.data?.items ?? emptyEmployees;
  const table = useTable({
    features: tableFeatureSet,
    columns: employeeColumns,
    data: items,
    rowCount: result.data?.total ?? 0,
    atoms: { pagination: paginationAtom },
    manualPagination: true,
  });
  const total = result.data?.total ?? 0;
  const pageCount = table.getPageCount();
  const headerScroll = useRef<HTMLDivElement>(null);
  const bodyScroll = useRef<HTMLDivElement>(null);
  const columns = (
    <colgroup>
      <col />
      <col className="w-[22%]" />
      <col className="w-[16%]" />
      <col className="w-[22%]" />
      <col className="w-12" />
    </colgroup>
  );
  const headings = (hidden = false) => table.getHeaderGroups().map((group) => (
    <TableRow key={group.id}>
      {group.headers.map((header) => (
        <TableHead key={header.id} className={header.id === "open" ? "text-right" : ""}>
          {header.isPlaceholder ? null : <span className={hidden ? "sr-only" : undefined}><table.FlexRender header={header} /></span>}
        </TableHead>
      ))}
    </TableRow>
  ));
  return (
    <ScrollArea
      className="h-[calc(100dvh-3.5rem)] min-h-0"
      contentClassName="mx-auto w-full max-w-[1440px] p-4"
      viewportProps={{ ref: scrollViewport, role: "region", "aria-label": "Прокрутка списка сотрудников" }}
    >
    <section data-employee-list className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Сотрудники
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Команда экосистемы «{tenant.name}»
          </p>
        </div>
        {canManage(tenant.role) && (
          <Link className={buttonVariants()} to="/company/employees/new">
            <UserPlus />
            Добавить сотрудника
          </Link>
        )}
      </div>
      <Card className="overflow-visible pt-0 md:gap-0">
        <div className="sticky top-0 z-20 rounded-t-xl bg-card pt-4">
        <CardHeader className="grid-cols-1 border-b sm:grid-cols-[1fr_auto]">
          <CardTitle>Список сотрудников</CardTitle>
          <CardDescription>
            {total
              ? `Всего сотрудников: ${total}`
              : "Поиск и управление командой"}
          </CardDescription>
          <CardAction className="col-start-1 row-span-1 row-start-3 w-full pt-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:w-80 sm:pt-0">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Поиск сотрудников"
                placeholder="ФИО, email или телефон"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </CardAction>
        </CardHeader>
        {items.length > 0 && (
          <div ref={headerScroll} onScroll={(event) => {
            if (bodyScroll.current) bodyScroll.current.scrollLeft = event.currentTarget.scrollLeft;
          }} className="hidden overflow-x-auto md:block [&>[data-slot=table-container]]:overflow-visible [scrollbar-width:none]">
            <Table aria-hidden="true" className="min-w-[800px] table-fixed">
              {columns}
              <TableHeader>{headings()}</TableHeader>
            </Table>
          </div>
        )}
        </div>
        <CardContent className="p-0" aria-busy={result.isFetching}>
          <ErrorMessage error={result.error} className="m-4" />
          {result.isPending ? (
            <EmployeeListSkeleton />
          ) : items.length === 0 ? (
            <EmptyEmployees search={query} canCreate={canManage(tenant.role)} />
          ) : (
            <>
              <div ref={bodyScroll} onScroll={(event) => {
                if (headerScroll.current) headerScroll.current.scrollLeft = event.currentTarget.scrollLeft;
              }} className="hidden overflow-x-auto md:block [&>[data-slot=table-container]]:overflow-visible">
                <Table className="min-w-[800px] table-fixed">
                  {columns}
                  <TableHeader className="h-0 [&_th]:h-0 [&_th]:p-0 [&_tr]:border-0">{headings(true)}</TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} className="h-12">
                        {row.getAllCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={cn("py-1.5", cell.column.id === "open" && "text-right")}
                          >
                            <table.FlexRender cell={cell} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-3 p-4 md:hidden">
                {items.map((employee) => (
                  <MobileEmployee key={employee.id} employee={employee} />
                ))}
              </div>
            </>
          )}
        </CardContent>
        {result.data && result.data.items.length > 0 && (
          <CardFooter className="flex flex-col gap-3 bg-muted/25 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Показывать</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Количество сотрудников на странице"
                  className="w-20"
                >
                  <SelectValue>{pagination.pageSize}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Страница {pagination.pageIndex + 1} из {Math.max(1, pageCount)}
              </span>
              <EmployeeTooltip label={"Предыдущая страница"}><Button
                variant="outline"
                size="icon-sm"
                aria-label="Предыдущая страница"
                disabled={!table.getCanPreviousPage() || result.isFetching}
                onClick={() => changePage(pagination.pageIndex - 1)}
              >
                <ChevronLeft />
              </Button></EmployeeTooltip>
              <EmployeeTooltip label={"Следующая страница"}><Button
                variant="outline"
                size="icon-sm"
                aria-label="Следующая страница"
                disabled={!table.getCanNextPage() || result.isFetching}
                onClick={() => changePage(pagination.pageIndex + 1)}
              >
                <ChevronRight />
              </Button></EmployeeTooltip>
            </div>
          </CardFooter>
        )}
      </Card>
    </section>
    </ScrollArea>
  );
}

function EmployeeListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Загрузка сотрудников"
      className="space-y-3 p-4"
    >
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-12 items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="ml-auto h-4 w-1/5" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyEmployees({
  search,
  canCreate,
}: {
  search: string;
  canCreate: boolean;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-4 py-10 text-center">
      <span className="mb-4 rounded-xl bg-muted p-3">
        <Users className="size-7 text-muted-foreground" />
      </span>
      <h3 className="font-medium">
        {search ? "Ничего не найдено" : "Пока нет сотрудников"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {search
          ? "Измените поисковый запрос или очистите поле."
          : "Добавьте первого сотрудника в вашу команду."}
      </p>
      {!search && canCreate && (
        <Link
          className={buttonVariants({ className: "mt-5" })}
          to="/company/employees/new"
        >
          <UserPlus />
          Добавить сотрудника
        </Link>
      )}
    </div>
  );
}

function MobileEmployee({ employee }: { employee: Employee }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <EmployeeAvatar employee={employee} size="lg" />
          <div className="min-w-0">
            <CardTitle className="truncate">{employee.fullName}</CardTitle>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <RoleBadge role={employee.role} />
              <AccessState employee={employee} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <a
          href={`tel:${employee.phone}`}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Phone className="size-4" />
          {formatPhone(employee.phone)}
        </a>
        <a
          href={`mailto:${employee.email}`}
          className="flex min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Mail className="size-4 shrink-0" />
          <span className="truncate">{employee.email}</span>
        </a>
      </CardContent>
      <CardFooter>
        <Link
          className={buttonVariants({
            variant: "outline",
            className: "w-full",
          })}
          to={`/company/employees/${employee.id}`}
        >
          Открыть карточку
          <ArrowRight />
        </Link>
      </CardFooter>
    </Card>
  );
}

const employeeSchema = z
  .object({
    lastName: z
      .string()
      .trim()
      .min(1, "Укажите фамилию")
      .max(200, "Не больше 200 символов"),
    firstName: z
      .string()
      .trim()
      .min(1, "Укажите имя")
      .max(200, "Не больше 200 символов"),
    middleName: z.string().trim().max(200, "Не больше 200 символов"),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Например +79990000000")),
    email: z.string().trim().email("Укажите корректный email").max(254),
    role: z.enum(["user", "admin"]),
    mode: z.enum(["invite", "password"]),
    password: z.string().max(256, "Не больше 256 символов"),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "password" && input.password.length < 8)
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Не меньше 8 символов",
      });
  });
type EmployeeFields = z.infer<typeof employeeSchema>;

function useInvitationCopy(url?: string) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    setLinkCopied(false);
    setCopyError(false);
  }, [url]);
  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let checking = false;
    async function checkClipboard() {
      if (checking || !document.hasFocus()) return;
      checking = true;
      try {
        const permission = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
        const matches = permission.state === "granted" && await navigator.clipboard.readText() === url;
        if (!disposed && document.hasFocus()) setLinkCopied(matches);
      } catch {
        if (!disposed) setLinkCopied(false);
      } finally {
        checking = false;
      }
    }
    const clear = () => setLinkCopied(false);
    void checkClipboard();
    const interval = window.setInterval(checkClipboard, 1000);
    window.addEventListener("focus", checkClipboard);
    window.addEventListener("blur", clear);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkClipboard);
      window.removeEventListener("blur", clear);
    };
  }, [url]);
  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyError(false);
      try {
        setLinkCopied(await navigator.clipboard.readText() === url);
      } catch {
        setLinkCopied(false);
      }
    } catch {
      setLinkCopied(false);
      setCopyError(true);
    }
  }
  return { linkCopied, copyError, copyLink };
}

function InvitationCopyButton({ linkCopied, copyLink, tooltipSide }: ReturnType<typeof useInvitationCopy> & { tooltipSide?: "right" | "bottom" }) {
  const label = linkCopied ? "Скопировано" : "Копировать ссылку";
  return (
    <EmployeeCardButton type="button" variant="ghost" className="size-6 px-0" aria-label={label} title={label} tooltipSide={tooltipSide} onClick={copyLink}>
      {linkCopied ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </EmployeeCardButton>
  );
}

function formatEmployeePhoneInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  const nationalNumber = /^[78]/.test(digits) ? digits.slice(1) : digits;
  return formatPhone("+7" + nationalNumber.slice(0, 10));
}

export function CreateEmployee({
  tenant,
  onDirty,
}: {
  tenant: Tenant;
  onDirty: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<CreateEmployeeResult>();
  const invitationCopy = useInvitationCopy(result?.invitationUrl);
  const form = useForm<EmployeeFields>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      lastName: "",
      firstName: "",
      middleName: "",
      phone: "+7",
      email: "",
      role: "user",
      mode: "invite",
      password: "",
    },
  });
  useEffect(() => {
    onDirty(form.formState.isDirty);
    return () => onDirty(false);
  }, [form.formState.isDirty, onDirty]);
  const mutation = useMutation({
    mutationFn: (input: EmployeeFields) =>
      api<CreateEmployeeResult>(`/api/v1/tenants/${tenant.id}/employees`, {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          ...input,
          password: input.mode === "password" ? input.password : undefined,
        }),
      }),
    onSuccess: async (data) => {
      form.reset();
      onDirty(false);
      await client.invalidateQueries({ queryKey: ["employees", tenant.id] });
      if (data.invitationUrl) setResult(data);
      else navigate(`/company/employees/${data.employee.id}`);
    },
  });
  if (!canManage(tenant.role))
    return (
      <ErrorMessage
        error={
          new Error("Создание сотрудников доступно владельцу и администратору.")
        }
      />
    );
  const mode = form.watch("mode");
  const errors = form.formState.errors;
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link
          className={cn(buttonVariants({ variant: "ghost", size: "default" }), employeeCardButtonSize)}
          to="/company/employees"
        >
          <ArrowLeft data-icon="inline-start" />
          Список сотрудников
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
          Новый сотрудник
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Добавьте человека в команду и выберите его доступ.
        </p>
      </div>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        noValidate
      >
        <Card className="gap-2">
          <CardHeader className="flex min-h-6 items-center">
            <CardTitle>Личные данные</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-x-4 gap-y-2 sm:grid-cols-2 [&>[data-slot=field]]:gap-1 [&_[data-slot=field-label]]:font-normal [&_[data-slot=field-label]]:leading-5 [&_[data-slot=field-label]]:text-muted-foreground">
              <FormField
                className="sm:col-start-1 sm:row-start-1"
                label="Фамилия *"
                id="lastName"
                error={errors.lastName?.message}
              >
                <Input
                  id="lastName"
                  className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  autoComplete="family-name"
                  aria-invalid={!!errors.lastName}
                  {...form.register("lastName")}
                />
              </FormField>
              <FormField
                className="sm:col-start-1 sm:row-start-2"
                label="Имя *"
                id="firstName"
                error={errors.firstName?.message}
              >
                <Input
                  id="firstName"
                  className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  autoComplete="given-name"
                  aria-invalid={!!errors.firstName}
                  {...form.register("firstName")}
                />
              </FormField>
              <FormField
                className="sm:col-start-1 sm:row-start-3"
                label="Отчество (необязательно)"
                id="middleName"
                error={errors.middleName?.message}
              >
                <Input
                  id="middleName"
                  className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  autoComplete="additional-name"
                  aria-invalid={!!errors.middleName}
                  {...form.register("middleName")}
                />
              </FormField>
              <FormField
                className="sm:col-start-2 sm:row-start-1"
                label="Телефон *"
                id="phone"
                error={errors.phone?.message}
              >
                <Input
                  id="phone"
                  className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="+7"
                  aria-invalid={!!errors.phone}
                  {...form.register("phone", {
                    onChange: (event) => {
                      if (
                        !(
                          event.nativeEvent as InputEvent
                        ).inputType?.startsWith("delete")
                      )
                        form.setValue(
                          "phone",
                          formatEmployeePhoneInput(event.target.value),
                          { shouldDirty: true },
                        );
                    },
                    onBlur: (event) =>
                      form.setValue("phone", formatEmployeePhoneInput(event.target.value), {
                        shouldValidate: true,
                        shouldDirty: true,
                      }),
                  })}
                />
              </FormField>
              <FormField
                className="sm:col-start-2 sm:row-start-2"
                label="Email *"
                id="email"
                error={errors.email?.message}
              >
                <Input
                  id="email"
                  className="h-8 px-2 py-0 text-sm font-medium focus-visible:ring-2"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  {...form.register("email")}
                />
              </FormField>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Field className="sm:col-start-2 sm:row-start-3">
                  <FieldLabel htmlFor="new-employee-role">Роль в экосистеме</FieldLabel>
                  <EmployeeRolePicker
                    id="new-employee-role"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                  />
                </Field>
              )}
            />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Способ подключения</CardTitle>
            <CardDescription>
              Пригласите сотрудника или создайте ему аккаунт с паролем.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Controller
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend className="sr-only">
                    Способ подключения
                  </FieldLegend>
                  <RadioGroup
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <ChoiceRadio
                      value="invite"
                      title="Пригласить ссылкой"
                      description="Сотрудник сам зарегистрируется или войдёт в существующий аккаунт."
                    />
                    <ChoiceRadio
                      value="password"
                      title="Задать пароль"
                      description="Создать новый аккаунт и передать пароль сотруднику."
                    />
                  </RadioGroup>
                </FieldSet>
              )}
            />
            {mode === "password" && (
              <>
                <Separator />
                <FormField
                  label="Пароль *"
                  id="password"
                  error={errors.password?.message}
                  className="[&_[data-slot=field-label]]:text-muted-foreground [&_[data-slot=field-description]]:text-sm [&_[data-slot=field-description]]:leading-normal [&_[data-slot=field-description]]:font-normal [&_[data-slot=field-description]]:italic"
                  description="* Минимум 8 символов. Обязательной смены при первом входе нет."
                >
                  <div className="relative">
                    <Input
                      id="password"
                      className="h-8 px-2 py-0 pr-9 text-sm font-medium focus-visible:ring-2"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={!!errors.password}
                      {...form.register("password")}
                    />
                    <EmployeeTooltip label={showPassword ? "Скрыть пароль" : "Показать пароль"}><Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1 right-1 size-6"
                      aria-label={
                        showPassword ? "Скрыть пароль" : "Показать пароль"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button></EmployeeTooltip>
                  </div>
                </FormField>
              </>
            )}
          </CardContent>
        </Card>
        <ErrorMessage error={mutation.error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            className={cn(buttonVariants({ variant: "outline" }))}
            to="/company/employees"
          >
            Отмена
          </Link>
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "Создаём…" : "Создать сотрудника"}
          </Button>
        </div>
      </form>
      {result?.invitationUrl && (
        <AlertDialog open onOpenChange={(open) => { if (!open) navigate("/company/employees"); }}>
          <AlertDialogContent onBackdropClick={() => navigate("/company/employees")} className="w-[calc(100%-2rem)] min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto [&>*]:min-w-0">
            <div className="relative flex min-h-6 items-center justify-center px-7">
              <AlertDialogTitle className="text-center leading-6">Сотрудник создан</AlertDialogTitle>
              <div className="absolute right-0"><InvitationCopyButton {...invitationCopy} /></div>
            </div>
            <InvitationLink url={result.invitationUrl} variant="inline" hideActions />
            {invitationCopy.copyError && <p className="text-sm text-destructive" role="alert">Выделите и скопируйте ссылку вручную.</p>}
            <AlertDialogFooter className="grid grid-cols-1 sm:grid-cols-2">
              <Link className={cn(buttonVariants({ variant: "outline" }), employeeCardButtonSize, "h-auto min-h-8 min-w-0 whitespace-normal py-1 w-full")} to={`/company/employees/${result.employee.id}`}>
                Карточка сотрудника
              </Link>
              <Link className={cn(buttonVariants({ variant: "outline" }), employeeCardButtonSize, "h-auto min-h-8 min-w-0 whitespace-normal py-1 w-full")} to="/company/employees">
                Список сотрудников
              </Link>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

function FormField({
  label,
  id,
  error,
  description,
  className,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field className={className} data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
function ChoiceRadio({
  value,
  title,
  description,
}: {
  value: string;
  title: string;
  description: string;
}) {
  return (
    <FieldLabel>
      <Field orientation="horizontal">
        <RadioGroupItem value={value} />
        <FieldContent>
          <FieldTitle>{title}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

export function EmployeeCard({
  tenant,
  id,
  onDirty,
}: {
  tenant: Tenant;
  id: string;
  onDirty: (value: boolean) => void;
}) {
  const client = useQueryClient();
  const [role, setRole] = useState<"user" | "admin">("user");
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["employee", tenant.id, id],
    queryFn: () =>
      api<Employee>(`/api/v1/tenants/${tenant.id}/employees/${id}`),
  });
  const invitation = useQuery({
    queryKey: ["employee-invitation", tenant.id, id],
    queryFn: () => api<{ invitationUrl: string; expiresAt?: string }>(
      `/api/v1/tenants/${tenant.id}/employees/${id}/invitation/refresh`,
      { method: "POST" },
    ),
    enabled: canManage(tenant.role) && query.data?.role !== "owner" &&
      query.data?.accessState !== "active" &&
      (query.data?.invitationState === "pending" || query.data?.invitationState === "expired"),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: (q) => {
      if (q.state.error) return false;
      const expiresAt = q.state.data?.expiresAt;
      return expiresAt
        ? Math.min(60_000, Math.max(1000, Date.parse(expiresAt) - Date.now() + 100))
        : false;
    },
  });
  const invitationCopy = useInvitationCopy(invitation.data?.invitationUrl);
  useEffect(() => {
    if (invitation.data && query.data?.invitationState === "expired") {
      void client.invalidateQueries({ queryKey: ["employee", tenant.id, id] });
      void client.invalidateQueries({ queryKey: ["employees", tenant.id] });
    }
  }, [invitation.data, query.data?.invitationState, client, tenant.id, id]);
  useEffect(() => {
    if (query.data && query.data.role !== "owner") setRole(query.data.role);
  }, [query.data]);
  const update = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["employee", tenant.id, id] }),
      client.invalidateQueries({ queryKey: ["employees", tenant.id] }),
      client.invalidateQueries({ queryKey: ["session"] }),
    ]);
  };
  const roleMutation = useMutation({
    mutationFn: () =>
      api<void>(`/api/v1/tenants/${tenant.id}/employees/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: async () => {
      await update();
    },
  });
  const invite = useMutation({
    mutationFn: () =>
      api<{ invitationUrl: string }>(
        `/api/v1/tenants/${tenant.id}/employees/${id}/invitation`,
        { method: "POST" },
      ),
    onSuccess: async (data) => {
      client.setQueryData(["employee-invitation", tenant.id, id], data);
      await client.invalidateQueries({ queryKey: ["employee-invitation", tenant.id, id] });
      await update();
    },
  });
  const revoke = useMutation({
    mutationFn: () =>
      api<void>(`/api/v1/tenants/${tenant.id}/employees/${id}/invitation`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setConfirm(false);
      client.removeQueries({ queryKey: ["employee-invitation", tenant.id, id] });
      await update();
    },
  });
  if (query.isPending) return <Busy />;
  if (query.error) return <ErrorMessage error={query.error} />;
  const employee = query.data!;
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <Link
        className={cn(buttonVariants({ variant: "ghost", size: "default" }), employeeCardButtonSize)}
        to="/company/employees"
      >
        <ArrowLeft data-icon="inline-start" />
        Список сотрудников
      </Link>
      <div className="space-y-5">
        <Card className="gap-2">
          <CardHeader>
            <div className="flex items-start gap-3 sm:items-center">
              <EmployeeAvatarEditor key={employee.id} initialImage={employeeAvatarImage(employee) ? demoProfileAvatarSrc : undefined} fallback={
                <Avatar size="lg" aria-hidden="true"><AvatarFallback className="bg-primary/10 text-primary">{initials(employee.fullName)}</AvatarFallback></Avatar>
              } />
              <div className="min-w-0 space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] md:text-3xl">
                  {employee.fullName}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge role={employee.role} />
                  <AccessState employee={employee} />
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
        <EmployeePersonalData key={employee.id} employee={employee}
          roleDirty={canManage(tenant.role) && employee.role !== "owner" && role !== employee.role}
          saving={roleMutation.isPending}
          onSaveRole={() => roleMutation.mutateAsync()}
          onCancelRole={() => {
            if (employee.role !== "owner") setRole(employee.role);
            roleMutation.reset();
          }}
        >
          {canManage(tenant.role) && employee.role !== "owner" ? (
            <div className="flex flex-col items-start gap-2">
              <Field className="w-full">
                <EmployeeRolePicker
                  id="employee-role"
                  disabled={roleMutation.isPending}
                  value={role}
                  onValueChange={setRole}
                />
              </Field>
            </div>
          ) : employee.role === "owner" ? (
            <Alert className="border-0 p-0">
              <AlertTitle>Защищённая роль</AlertTitle>
              <AlertDescription>
                Роль владельца экосистемы нельзя изменить.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              У вас нет прав для изменения роли сотрудника.
            </p>
          )}
          <ErrorMessage error={roleMutation.error} className="mt-2" />
        </EmployeePersonalData>
        <EmployeeAssignments tenant={tenant} id={id} onDirty={onDirty} />
        <Card role="region" aria-labelledby="employee-connection-title" className="gap-2">
          <CardHeader>
            <CardTitle>
              <h2 id="employee-connection-title">Подключение сотрудника</h2>
            </CardTitle>
            {canManage(tenant.role) && employee.role !== "owner" && employee.accessState !== "active" && (employee.invitationState === "pending" || employee.invitationState === "expired") && (
              <CardAction className="row-span-1 flex h-0 items-center self-center gap-0.5">
                {invitation.data && <InvitationCopyButton {...invitationCopy} tooltipSide="bottom" />}
                <EmployeeCardButton variant="ghost" className="size-6 px-0 text-destructive hover:text-destructive" aria-label="Отменить приглашение" title="Отменить приглашение" tooltipSide="bottom" onClick={() => setConfirm(true)}>
                  <CircleX aria-hidden="true" />
                </EmployeeCardButton>
              </CardAction>
            )}
            {canManage(tenant.role) && employee.role !== "owner" && employee.accessState !== "active" && employee.invitationState !== "pending" && employee.invitationState !== "expired" && (
              <CardAction className="row-span-1 flex h-0 items-center self-center">
                <EmployeeCardButton variant="outline" className="h-6 gap-1 px-2 text-xs" disabled={invite.isPending} onClick={() => invite.mutate()}>
                  {invite.isPending ? "Готовим…" : "Пригласить"}
                </EmployeeCardButton>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {canManage(tenant.role) &&
            employee.role !== "owner" &&
            employee.accessState !== "active" ? (
              <>
                {employee.invitationState === "pending" || employee.invitationState === "expired" ? (
                  invitation.isPending ? (
                    <Busy text="Загрузка ссылки…" />
                  ) : invitation.error ? (
                    <div className="space-y-3">
                      <ErrorMessage error={invitation.error} />
                      <EmployeeCardButton variant="outline" onClick={() => invitation.refetch()}>
                        Повторить загрузку
                      </EmployeeCardButton>
                    </div>
                  ) : invitation.data ? (
                    <InvitationLink
                      url={invitation.data.invitationUrl}
                      variant="inline"
                      expiresAt={invitation.data.expiresAt}
                      showTitle={false}
                      standardButton
                      buttonClassName={employeeCardButtonSize}
                      hideActions
                    />
                  ) : null
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {employee.invitationState === "expired"
                      ? "Срок приглашения истёк."
                      : employee.invitationState === "revoked"
                        ? "Приглашение отменено."
                        : "Приглашение ещё не создано."}
                  </p>
                )}
                <ErrorMessage error={invite.error} />
                {invitationCopy.copyError && <p className="text-sm text-destructive" role="alert">Выделите и скопируйте ссылку вручную.</p>}
              </>
            ) : employee.accessState === "active" ? (
              <p className="text-sm text-muted-foreground">
                Сотрудник уже подключён к экосистеме.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                У вас нет прав для управления приглашением.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <EmployeeConfirmationSheet
        open={confirm}
        onOpenChange={setConfirm}
        title="Отменить приглашение?"
        description="Сотрудник не сможет подключиться по выданной ссылке."
        cancelLabel="Оставить"
        confirmLabel="Отменить"
        confirmVariant="outline"
        pending={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      >
        <ErrorMessage error={revoke.error} />
      </EmployeeConfirmationSheet>
    </section>
  );
}
