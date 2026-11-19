import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  ChevronsUpDown,
  ClipboardCheck,
  Construction,
  Factory,
  FileText,
  HandCoins,
  Handshake,
  Landmark,
  LogOut,
  Network,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  api,
  setCSRF,
  type Session,
  type Tenant,
  type Invitation,
} from "@/shared/api/client";
import { Brand, Busy, ErrorMessage } from "@/shared/ui/components";
import { demoProfileAvatarSrc, isLocalPreview } from "@/shared/lib/local-preview";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { Button, buttonVariants } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { NotificationsPage, notificationsPath, ProfilePage, profilePath } from "./account-pages";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/shared/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  Employees,
  CreateEmployee,
  EmployeeCard,
} from "@/features/company/Employees";
import { EmployeeConfirmationSheet } from "@/features/company/employee-confirmation-sheet";
import { CatalogPage } from "@/features/company/Catalog";

type Module = {
  id: string;
  name: string;
  icon: LucideIcon;
  sections: readonly (readonly [string, string])[];
};
const modules: Module[] = [
  {
    id: "money",
    name: "Деньги",
    icon: Wallet,
    sections: [
      ["cash", "Касса"],
      ["banks", "Банки"],
      ["loans", "Кредиты и займы"],
      ["payroll", "Зарплата"],
    ],
  },
  {
    id: "company",
    name: "Моя компания",
    icon: Building2,
    sections: [
      ["employees", "Сотрудники"],
      ["businesses", "Предприятия"],
      ["organizations", "Организации"],
      ["contracts", "Договоры"],
      ["counterparties", "Контрагенты"],
      ["catalog", "Номенклатура"],
    ],
  },
  {
    id: "sales",
    name: "Продажи",
    icon: ShoppingBag,
    sections: [
      ["invoices", "Счета на оплату"],
      ["acts", "Акты выполненных работ"],
    ],
  },
  {
    id: "settings",
    name: "Настройки",
    icon: Settings,
    sections: [
      ["fields", "Поля"],
      ["access", "Права доступа"],
    ],
  },
];
const sectionIcons: Record<string, LucideIcon> = {
  employees: Users,
  businesses: Factory,
  organizations: Building2,
  contracts: FileText,
  counterparties: Handshake,
  catalog: Package,
  cash: Wallet,
  banks: Landmark,
  loans: HandCoins,
  payroll: Banknote,
  invoices: Receipt,
  acts: ClipboardCheck,
  fields: SlidersHorizontal,
  access: ShieldCheck,
};
const subSections: Record<string, string[]> = {
  cash: ["Список касс", "Движение по кассе"],
  banks: ["Банковские счета", "Движение по счетам"],
  loans: ["Договоры", "Начисления"],
  payroll: ["Движение по зарплате", "Виды начислений и удержаний"],
  businesses: ["Список предприятий", "Отделы"],
  organizations: ["Список организаций"],
  contracts: ["Список договоров"],
  counterparties: ["Список контрагентов"],
  catalog: ["Список номенклатуры"],
  invoices: ["Список счетов на оплату"],
  acts: ["Список актов выполненных работ"],
};

export function Application() {
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);
  const [switchTo, setSwitchTo] = useState<string>();
  const [switching, setSwitching] = useState(false);
  const [globalError, setGlobalError] = useState<unknown>();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<Session>("/api/v1/session"),
  });
  useEffect(() => {
    if (session.data?.authenticated) setCSRF(session.data.csrfToken);
    else setCSRF("");
  }, [session.data]);
  useEffect(() => {
    const listener = () => {
      client.clear();
      setCSRF("");
      navigate("/login");
    };
    window.addEventListener("neiroot:session-expired", listener);
    return () =>
      window.removeEventListener("neiroot:session-expired", listener);
  }, [client, navigate]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const changeTenant = async (id: string) => {
    setGlobalError(undefined);
    setSwitching(true);
    try {
      await api("/api/v1/session/tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId: id }),
      });
      await client.cancelQueries();
      client.clear();
      setDirty(false);
      navigate("/company/employees");
      await client.fetchQuery({
        queryKey: ["session"],
        queryFn: () => api<Session>("/api/v1/session"),
      });
    } catch (error) {
      setGlobalError(error);
    } finally {
      setSwitching(false);
      setSwitchTo(undefined);
    }
  };
  const logout = async () => {
    setGlobalError(undefined);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setDirty(false);
      client.clear();
      setCSRF("");
      navigate("/login");
    } catch (error) {
      setGlobalError(error);
      client.invalidateQueries({ queryKey: ["session"] });
    }
  };
  if (session.isPending || switching)
    return (
      <FullPage>
        <Busy
          text={switching ? "Переключаем экосистему…" : "Загрузка Neiroot…"}
        />
      </FullPage>
    );
  if (session.error)
    return (
      <FullPage>
        <Card className="w-full max-w-md">
          <CardHeader>
            <Brand />
            <CardTitle className="pt-4 text-xl">
              Не удалось открыть Neiroot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ErrorMessage error={session.error} />
            <Button onClick={() => session.refetch()}>Повторить</Button>
          </CardContent>
        </Card>
      </FullPage>
    );
  if (location.pathname === "/invite")
    return (
      <Invite
        session={session.data}
        onAccepted={async () => {
          client.clear();
          navigate("/company/employees");
        }}
      />
    );
  if (!session.data?.authenticated) return <Login />;
  const me = session.data;
  const tenant =
    me.tenants.find((item) => item.id === me.activeTenantId) || me.tenants[0];
  if (!tenant)
    return (
      <Onboarding
        onCreated={async () => {
          client.clear();
          navigate("/company/employees");
        }}
        fullName={me.fullName}
      />
    );
  const segments = location.pathname.split("/").filter(Boolean);
  const selected =
    modules.find((module) => module.id === segments[0]) || modules[1];
  const section =
    selected.sections.find((item) => item[0] === segments[1]) ||
    selected.sections[0];
  const accountPath = location.pathname.replace(/\/$/, "");
  const isAccountPage = accountPath === profilePath || accountPath === notificationsPath;
  const isEmployees = !isAccountPage && selected.id === "company" && section[0] === "employees";
  const defaultOpen = (() => {
    try {
      return localStorage.getItem("neiroot-sidebar-open") !== "false";
    } catch {
      return true;
    }
  })();
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className="min-h-svh bg-background text-foreground"
    >
      <AppSidebar
        me={me}
        selected={isAccountPage ? undefined : selected}
        sectionId={section[0]}
        onLogout={logout}
      />
      <SidebarInset className="min-w-0 bg-background">
        <AppHeader
          tenant={tenant}
          dirty={dirty}
          onTenantChange={(id) => {
            if (dirty) setSwitchTo(id);
            else void changeTenant(id);
          }}
          tenants={me.tenants}
        />
        <div
          className={isEmployees && !segments[2] ? "min-h-0 w-full flex-1" : "mx-auto w-full max-w-[1440px] flex-1 p-4"}
          key={tenant.id}
        >
          <ErrorMessage error={globalError} className="mb-4" />
          {accountPath === profilePath ? (
            <ProfilePage account={me} />
          ) : accountPath === notificationsPath ? (
            <NotificationsPage />
          ) : isEmployees ? (
            segments[2] === "new" ? (
              <CreateEmployee tenant={tenant} onDirty={setDirty} />
            ) : segments[2] ? (
              <EmployeeCard
                key={segments[2]}
                tenant={tenant}
                id={segments[2]}
                onDirty={setDirty}
              />
            ) : (
              <Employees tenant={tenant} />
            )
          ) : selected.id === "company" &&
            (section[0] === "businesses" || section[0] === "organizations") ? (
            <div>
              <CatalogPage
                key={section[0]}
                tenant={tenant}
                kind={section[0]}
                onDirty={setDirty}
              />
            </div>
          ) : (
            <Placeholder
              title={section[1]}
              subSections={subSections[section[0]]}
            />
          )}
        </div>
      </SidebarInset>
      {isEmployees ? (
        <EmployeeConfirmationSheet
          open={blocker.state === "blocked"}
          onOpenChange={(open) => {
            if (!open && blocker.state === "blocked") blocker.reset?.();
          }}
          title="Есть несохранённые данные"
          description="Покинуть форму и отменить введённые изменения?"
          cancelLabel="Продолжить"
          confirmLabel="Покинуть"
          destructive
          onConfirm={() => {
            setDirty(false);
            blocker.proceed?.();
          }}
        />
      ) : (
      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Есть несохранённые данные</AlertDialogTitle>
            <AlertDialogDescription>
              Покинуть форму и отменить введённые изменения?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить заполнение</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDirty(false);
                blocker.proceed?.();
              }}
            >
              Покинуть форму
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
      {isEmployees ? (
        <EmployeeConfirmationSheet
          open={!!switchTo}
          onOpenChange={(open) => {
            if (!open) setSwitchTo(undefined);
          }}
          title="Сменить экосистему?"
          description="Форма будет закрыта. Несохранённые изменения будут потеряны."
          cancelLabel="Остаться"
          confirmLabel="Переключить"
          onConfirm={() => {
            if (switchTo) {
              setDirty(false);
              void changeTenant(switchTo);
            }
          }}
        />
      ) : (
      <AlertDialog
        open={!!switchTo}
        onOpenChange={(open) => {
          if (!open) setSwitchTo(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сменить экосистему?</AlertDialogTitle>
            <AlertDialogDescription>
              Форма будет закрыта. Несохранённые изменения будут потеряны.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Остаться</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (switchTo) {
                  setDirty(false);
                  void changeTenant(switchTo);
                }
              }}
            >
              Переключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </SidebarProvider>
  );
}

type EcosystemOption = Pick<Tenant, "id" | "name"> & { demo?: true };

const demoEcosystem = {
  id: "demo-autoattribute",
  name: "Автоатрибут",
  demo: true,
} satisfies EcosystemOption;

function AppHeader({
  tenant,
  tenants,
  dirty,
  onTenantChange,
}: {
  tenant: Tenant;
  tenants: Tenant[];
  dirty: boolean;
  onTenantChange: (id: string) => void;
}) {
  const hasRealOption = tenants.some(
    ({ name }) => name.trim().toLowerCase() === demoEcosystem.name.toLowerCase(),
  );
  const options = isLocalPreview && !hasRealOption ? [...tenants, demoEcosystem] : tenants;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-sidebar px-3 md:px-4">
      <SidebarTrigger className="md:hidden" />
      <Brand className="ml-1 md:hidden" />
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <Combobox<EcosystemOption>
          items={options}
          value={tenant}
          itemToStringLabel={(item) => item.name}
          itemToStringValue={(item) => item.id}
          isItemEqualToValue={(item, value) => item.id === value.id}
          onValueChange={(value) => {
            if (value && !value.demo && value.id !== tenant.id) {
              onTenantChange(value.id);
            }
          }}
        >
          <ComboboxInput
            aria-label="Экосистема"
            placeholder="Выберите экосистему"
            className="w-[215px]"
            icon={<Network className="size-4" />}
          />
          <ComboboxContent align="end">
            <ComboboxEmpty>Экосистемы не найдены</ComboboxEmpty>
            <ComboboxList>
              {(item: EcosystemOption) => (
                <ComboboxItem key={item.id} value={item} disabled={item.demo}>
                  <span className="min-w-0 break-words">{item.name}</span>
                  {item.demo && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Демо
                    </span>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <ThemeToggle />
      </div>
      {dirty && (
        <span className="sr-only" role="status">
          Есть несохранённые изменения
        </span>
      )}
    </header>
  );
}

function AppSidebar({
  me,
  selected,
  sectionId,
  onLogout,
}: {
  me: Extract<Session, { authenticated: true }>;
  selected: Module | undefined;
  sectionId: string;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, setOpenMobile, isMobile } = useSidebar();
  const compactProfile = state === "collapsed" && !isMobile;
  const [openModule, setOpenModule] = useState(selected?.id ?? "");
  const nameParts = [me.lastName?.trim() ?? "", me.firstName?.trim() ?? ""].filter(
    Boolean,
  );
  const profileName = nameParts.join(" ") || "Профиль";
  const initials = nameParts
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const profileMark = initials || <UserRound className="size-3.5" />;
  const profileAvatar = (
    <Avatar
      aria-hidden="true"
      className="in-data-[slot=sidebar-footer]:size-[34px]"
    >
      {isLocalPreview && <AvatarImage src={demoProfileAvatarSrc} alt="" />}
      <AvatarFallback className="bg-primary/10 text-primary">
        {profileMark}
      </AvatarFallback>
    </Avatar>
  );
  useEffect(() => { if (selected) setOpenModule(selected.id); }, [selected]);
  const follow = (path: string) => {
    if (isMobile) setOpenMobile(false);
    navigate(path);
  };
  return (
    <Sidebar collapsible="icon" aria-label="Главное меню">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border p-2">
        <div className="flex w-full min-w-0 items-center gap-2">
          <Brand className="min-w-0 px-1 group-data-[collapsible=icon]:hidden" />
          <SidebarTrigger className="ml-auto shrink-0 group-data-[collapsible=icon]:mx-auto" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Разделы</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {modules.map((module) => {
                const Icon = module.icon;
                const open = openModule === module.id;
                return (
                  <SidebarMenuItem key={module.id}>
                    <Collapsible
                      open={open}
                      onOpenChange={(next) =>
                        setOpenModule(next ? module.id : "")
                      }
                    >
                      <SidebarMenuButton
                        tooltip={module.name}
                        isActive={module.id === selected?.id}
                        className="group-has-[[data-sidebar=menu-action]:hover]/menu-item:bg-sidebar-accent group-has-[[data-sidebar=menu-action]:hover]/menu-item:text-sidebar-accent-foreground"
                        onClick={() => {
                          if (state === "collapsed")
                            follow(`/${module.id}/${module.sections[0][0]}`);
                          else setOpenModule(open ? "" : module.id);
                        }}
                      >
                        <Icon />
                        <span>{module.name}</span>
                      </SidebarMenuButton>
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuAction
                            className="hover:bg-transparent hover:text-sidebar-accent-foreground"
                            aria-label={
                              open ? "Свернуть раздел" : "Раскрыть раздел"
                            }
                            aria-expanded={open}
                          />
                        }
                      >
                        <ChevronDown
                          className={
                            open
                              ? "rotate-180 transition-transform"
                              : "transition-transform"
                          }
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {module.sections.map(([id, name]) => {
                            const SectionIcon = sectionIcons[
                              id
                            ] as ComponentType<{ className?: string }>;
                            const active =
                              module.id === selected?.id && id === sectionId;
                            const path = `/${module.id}/${id}`;
                            return (
                              <SidebarMenuSubItem key={id}>
                                <SidebarMenuSubButton
                                  render={
                                    <Link
                                      to={path}
                                      onClick={() => {
                                        if (isMobile) setOpenMobile(false);
                                      }}
                                    />
                                  }
                                  isActive={active}
                                  aria-current={active ? "page" : undefined}
                                >
                                  <SectionIcon />
                                  <span>{name}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="h-[34px] px-0 group-data-[collapsible=icon]:size-[34px]! group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:rounded-full data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                    aria-label="Меню профиля"
                  />
                }
              >
                {profileAvatar}
                {!compactProfile && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left text-[15px] font-medium">
                      {profileName}
                    </span>
                    <ChevronsUpDown
                      aria-hidden="true"
                      className="ml-auto size-[18px]!"
                    />
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={8}
                className="w-62 max-w-(--available-width)"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-2 px-1 py-1.5">
                    {profileAvatar}
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm text-foreground">
                        {profileName}
                      </span>
                      <span className="wrap-anywhere font-normal text-muted-foreground">
                        {me.email}
                      </span>
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => follow(profilePath)}
                  >
                    <UserRound />
                    Профиль
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => follow(notificationsPath)}
                  >
                    <Bell />
                    Уведомления
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void onLogout()}>
                  <LogOut />
                  Выход
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Login() {
  useEffect(() => {
    window.location.replace("/api/auth/login");
  }, []);
  return (
    <FullPage>
      <Busy text="Открываем страницу входа…" />
    </FullPage>
  );
}

function Onboarding({
  fullName,
  onCreated,
}: {
  fullName: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api<Tenant>("/api/v1/onboarding", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: onCreated,
  });
  return (
    <FullPage>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Brand />
          <h1 className="pt-5 text-2xl leading-snug font-semibold">
            Создайте экосистему
          </h1>
          <CardDescription>
            {fullName}, здесь вы сможете вести предприятия, их структуру и
            команду.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor="tenant-name">Название экосистемы</FieldLabel>
              <Input
                id="tenant-name"
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Название вашей экосистемы"
              />
            </Field>
            <ErrorMessage error={mutation.error} />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending || !name.trim()}
            >
              {mutation.isPending ? "Создаём…" : "Создать экосистему"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </FullPage>
  );
}

function Placeholder({
  title,
  subSections,
}: {
  title: string;
  subSections?: string[];
}) {
  const [active, setActive] = useState("0");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Раздел CRM</p>
      </div>
      <Tabs
        className="gap-4"
        value={active}
        onValueChange={(value) => setActive(String(value))}
      >
        {subSections && (
          <TabsList
            variant="line"
            className="max-w-full justify-start overflow-x-auto"
          >
            {subSections.map((text, index) => (
              <TabsTrigger key={text} value={String(index)}>
                {text}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {(subSections || [title]).map((text, index) => (
          <TabsContent key={text} value={String(index)}>
            <Card className="min-h-64 items-center justify-center text-center">
              <CardContent className="flex flex-col items-center gap-3">
                <span className="rounded-xl bg-muted p-3">
                  <Construction className="size-7 text-muted-foreground" />
                </span>
                <div>
                  <h2 className="font-medium">{text}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Этот раздел появится на следующем этапе.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function Invite({
  session,
  onAccepted,
}: {
  session?: Session;
  onAccepted: () => Promise<void>;
}) {
  const [token] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const value =
      params.get("token") || sessionStorage.getItem("neiroot-invitation") || "";
    if (value) {
      sessionStorage.setItem("neiroot-invitation", value);
      history.replaceState(null, "", "/invite");
    }
    return value;
  });
  const query = useQuery({
    queryKey: ["invitation", token],
    queryFn: () =>
      api<Invitation>("/api/v1/invitations/resolve", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      api<Tenant>("/api/v1/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: async () => {
      sessionStorage.removeItem("neiroot-invitation");
      await onAccepted();
    },
  });
  return (
    <FullPage>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Brand />
          <CardTitle className="pt-5 text-2xl">Приглашение в команду</CardTitle>
          {query.data && (
            <CardDescription>
              Экосистема «{query.data.tenantName}»
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isPending ? (
            <Busy />
          ) : query.error ? (
            <>
              <ErrorMessage error={query.error} />
              <Link
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full",
                })}
                to="/"
              >
                На главную
              </Link>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-muted/50 p-4 text-sm">
                <p>
                  Приглашение для <strong>{query.data!.email}</strong>
                </p>
                <p className="mt-1 text-muted-foreground">
                  Действует до{" "}
                  {new Date(query.data!.expiresAt).toLocaleString("ru-RU")}
                </p>
              </div>
              {session?.authenticated ? (
                <>
                  <FieldDescription>
                    Вы вошли как {session.email}
                  </FieldDescription>
                  <ErrorMessage error={accept.error} />
                  <Button
                    className="w-full"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate()}
                  >
                    {accept.isPending ? "Подключаем…" : "Принять приглашение"}
                  </Button>
                  {session.email.toLowerCase() !==
                    query.data!.email.toLowerCase() && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        await api("/api/auth/logout", { method: "POST" });
                        window.location.href =
                          "/api/auth/login?returnTo=/invite";
                      }}
                    >
                      Войти другим аккаунтом
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <a
                    className={buttonVariants({ className: "w-full" })}
                    href="/api/auth/login?signup=1&returnTo=/invite"
                  >
                    Зарегистрироваться
                  </a>
                  <a
                    className={buttonVariants({
                      variant: "outline",
                      className: "w-full",
                    })}
                    href="/api/auth/login?returnTo=/invite"
                  >
                    У меня уже есть аккаунт
                  </a>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </FullPage>
  );
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/35 p-4">
      {children}
    </div>
  );
}
