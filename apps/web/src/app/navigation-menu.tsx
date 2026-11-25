import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, GripVertical, TriangleAlert } from "lucide-react";
import { api } from "@/shared/api/client";
import type { components } from "@/shared/api/schema.gen";
import { Button } from "@/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar } from "@/shared/ui/sidebar";
import { completeOrder, modules, sectionIcons } from "./navigation-model";

type Preferences = components["schemas"]["NavigationPreferences"];
type Order = components["schemas"]["NavigationOrder"];
type Transfer = { list: string; id: string; name: string; items: string[]; original: string[]; keyboard: boolean };
const defaultSections = Object.fromEntries(modules.map(module => [module.id, module.sections.map(([id]) => id)]));
const defaults: Preferences = { modules: modules.map(module => module.id), sections: defaultSections };

function move(items: string[], id: string, to: number): string[] {
  const result = items.filter(item => item !== id);
  result.splice(Math.max(0, Math.min(to, result.length)), 0, id);
  return result;
}

export function NavigationMenu({ subject, tenantId, selectedId, sectionId, onFollow }: {
  subject: string; tenantId: string; selectedId?: string; sectionId: string; onFollow: (path: string) => void;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const compact = state === "collapsed" && !isMobile;
  const client = useQueryClient();
  const key = ["navigation", subject, tenantId];
  const base = `/api/v1/tenants/${tenantId}/me/navigation`;
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => api<Preferences>(base, { signal }), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false });
  const [openModule, setOpenModule] = useState(selectedId ?? "");
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const transferRef = useRef<Transfer | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLUListElement>(null);
  const suppressionUntil = useRef(0);
  const suppressedSource = useRef<{ list: string; id: string } | null>(null);
  const scrollFrame = useRef(0);
  const scrollSpeed = useRef(0);
  const scrollElement = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const preferences = query.data ?? defaults;
  const available = (list: string) => list === "modules" ? defaults.modules : defaultSections[list];
  const order = (list: string): string[] => {
    if (transfer?.list === list) return transfer.items;
    if (overrides[list]) return overrides[list];
    return completeOrder(list === "modules" ? preferences.modules : preferences.sections[list], available(list));
  };
  const enabled = !isMobile && query.isSuccess && !query.isFetching;
  const stopScroll = () => { cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; scrollSpeed.current = 0; };
  const changeTransfer = (next: Transfer | null) => { transferRef.current = next; setTransfer(next); };
  useEffect(() => { if (selectedId) setOpenModule(selectedId); }, [selectedId, sectionId]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimationFrame(scrollFrame.current); transferRef.current = null; };
  }, []);
  useEffect(() => { changeTransfer(null); stopScroll(); }, [isMobile, compact, selectedId, sectionId]);

  const save = async (list: string, items: string[]) => {
    if (pendingRef.current.has(list)) return;
    pendingRef.current.add(list);
    setPending(new Set(pendingRef.current));
    setOverrides(previous => ({ ...previous, [list]: items }));
    setError("");
    try {
      const response = await api<Order>(list === "modules" ? `${base}/modules` : `${base}/modules/${list}/sections`, { method: "PUT", body: JSON.stringify({ items }) });
      client.setQueryData<Preferences>(key, previous => {
        const current = previous ?? defaults;
        return list === "modules" ? { ...current, modules: response.items } : { ...current, sections: { ...current.sections, [list]: response.items } };
      });
      if (mounted.current) setMessage("Порядок меню сохранён.");
    } catch {
      if (mounted.current) { setError("Не удалось сохранить порядок меню. Восстановлен предыдущий порядок. Повторите перемещение."); setMessage("Перемещение не сохранено."); }
    } finally {
      pendingRef.current.delete(list);
      if (mounted.current) {
        setPending(new Set(pendingRef.current));
        setOverrides(previous => { const next = { ...previous }; delete next[list]; return next; });
      }
    }
  };
  const begin = (list: string, id: string, name: string, keyboard: boolean) => {
    if (!enabled || pendingRef.current.has(list) || transferRef.current) return false;
    const items = order(list);
    changeTransfer({ list, id, name, items, original: items, keyboard });
    setMessage(`Перемещение: ${name}. Используйте стрелки, Enter для сохранения, Escape для отмены.`);
    return true;
  };
  const finish = (commit: boolean) => {
    const current = transferRef.current;
    stopScroll();
    if (!current) return;
    changeTransfer(null);
    if (current.keyboard) {
      requestAnimationFrame(() => {
        const selector = compact && current.list === "modules" ? `[data-module-button="${current.id}"]` : `[data-move-list="${current.list}"][data-move-id="${current.id}"]`;
        menuRef.current?.querySelector<HTMLElement>(selector)?.focus();
      });
    }
    if (commit && current.items.join() !== current.original.join()) void save(current.list, current.items);
    else setMessage(commit ? "Порядок не изменился." : "Перемещение отменено.");
  };
  const keyboard = (event: KeyboardEvent, list: string, id: string, name: string) => {
    const current = transferRef.current;
    if (!current) {
      if (event.code === "Space" && enabled && !pendingRef.current.has(list)) { event.preventDefault(); event.stopPropagation(); begin(list, id, name, true); }
      return;
    }
    if (!current.keyboard || current.list !== list || current.id !== id) return;
    if (["ArrowUp", "ArrowDown", "Enter", "Escape", "Tab", " "].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Enter") finish(true);
      else if (event.key === "Escape" || event.key === "Tab") finish(false);
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const items = move(current.items, id, current.items.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1));
        changeTransfer({ ...current, items });
        setMessage(`${name}: позиция ${items.indexOf(id) + 1} из ${items.length}.`);
        const element = event.currentTarget as HTMLElement;
        requestAnimationFrame(() => { element.focus(); element.scrollIntoView({ block: "nearest" }); });
      }
    }
  };
  const source = (list: string, id: string, name: string) => ({
    draggable: enabled && !pending.has(list),
    "aria-describedby": enabled ? "navigation-move-help" : undefined,
    onKeyDown: (event: KeyboardEvent) => keyboard(event, list, id, name),
    onDragStart: (event: DragEvent) => {
      event.stopPropagation();
      if (!begin(list, id, name, false)) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-neiroot-navigation", `${list}:${id}`);
      suppressedSource.current = { list, id };
      suppressionUntil.current = Infinity;
    },
    onDragEnd: (event: DragEvent) => { event.stopPropagation(); suppressionUntil.current = Date.now() + 250; finish(false); },
  });
  const target = (list: string, id: string) => ({
    "data-nav-list": list,
    "data-nav-id": id,
    "aria-busy": pending.has(list),
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const current = transferRef.current;
      if (!current || current.keyboard || current.list !== list) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move";
      if (current.id !== id) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const remaining = current.items.filter(item => item !== current.id);
        const index = remaining.indexOf(id) + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
        const items = move(current.items, current.id, index);
        if (items.join() !== current.items.join()) changeTransfer({ ...current, items });
      }
    },
    onDrop: (event: DragEvent) => {
      if (transferRef.current?.list !== list || transferRef.current.keyboard) return;
      event.preventDefault(); event.stopPropagation(); suppressionUntil.current = Date.now() + 250; finish(true);
    },
    className: transfer?.list === list && transfer.id === id ? "outline outline-2 outline-primary outline-offset-1 rounded-md bg-sidebar-accent" : undefined,
  });
  const handle = (list: string, id: string, name: string) => !isMobile && (
    <Button variant="ghost" size="icon-xs" type="button" disabled={!enabled || pending.has(list)}
      aria-label={`Переместить ${list === "modules" ? "модуль" : "раздел"} «${name}»`}
      data-move-list={list} data-move-id={id} {...source(list, id, name)}
      onClick={event => { event.preventDefault(); event.stopPropagation(); if (!transferRef.current) begin(list, id, name, true); }}
      className={`absolute top-0.5 z-10 cursor-grab opacity-0 focus-visible:opacity-100 disabled:cursor-default active:cursor-grabbing ${list === "modules" ? "right-7 group-hover/menu-item:opacity-100" : "right-0 group-hover/menu-sub-item:opacity-100"}`}>
      <GripVertical className="size-3.5" />
    </Button>
  );
  const scroll = (event: DragEvent) => {
    if (!transferRef.current || transferRef.current.keyboard) return;
    const element = menuRef.current?.closest<HTMLElement>('[data-slot="sidebar-content"]');
    if (!element) return;
    scrollElement.current = element;
    const bounds = element.getBoundingClientRect();
    scrollSpeed.current = event.clientY < bounds.top + 40 ? -8 : event.clientY > bounds.bottom - 40 ? 8 : 0;
    if (!scrollSpeed.current) { stopScroll(); return; }
    if (!scrollFrame.current) {
      const tick = () => { scrollElement.current?.scrollBy(0, scrollSpeed.current); scrollFrame.current = requestAnimationFrame(tick); };
      scrollFrame.current = requestAnimationFrame(tick);
    }
  };

  return <>
    <p id="navigation-move-help" className="sr-only">Пробел — начать перемещение, стрелки — изменить позицию, Enter — сохранить, Escape — отменить.</p>
    <p className="sr-only" role="status" aria-live="polite">{message}</p>
    {compact && (error || query.isError) && <SidebarMenuButton tooltip={error || "Не удалось загрузить личный порядок меню. Нажмите, чтобы повторить."} aria-label={error || "Повторить загрузку личного порядка меню"} className="text-destructive" onClick={() => { if (query.isError) void query.refetch(); }}><TriangleAlert /><span>Ошибка порядка меню</span></SidebarMenuButton>}
    {(error || query.isError) && <div role="alert" className="p-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only">
      {error || "Не удалось загрузить личный порядок меню."}
      {query.isError && <Button variant="link" size="xs" onClick={() => void query.refetch()}>Повторить</Button>}
    </div>}
    <SidebarMenu ref={menuRef} className="gap-px" aria-label="Модули" onDragOverCapture={scroll}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stopScroll(); }}
      onClickCapture={event => {
        const source = suppressedSource.current;
        if (!source || Date.now() >= suppressionUntil.current) return;
        const row = (event.target as HTMLElement).closest(`[data-nav-list="${source.list}"]`);
        if (row?.getAttribute("data-nav-id") === source.id) { event.preventDefault(); event.stopPropagation(); }
      }}>
      {order("modules").map(id => {
        const module = modules.find(module => module.id === id)!;
        const Icon = module.icon;
        const open = openModule === id;
        return <SidebarMenuItem key={id} {...target("modules", id)}>
          <Collapsible open={open} onOpenChange={next => { if (!transferRef.current) setOpenModule(next ? id : ""); }}>
            <SidebarMenuButton tooltip={module.name} data-module-button={id} isActive={id === selectedId}
              {...(compact ? source("modules", id, module.name) : {})}
              className="pr-14 group-data-[collapsible=icon]:pr-2 group-has-[[data-sidebar=menu-action]:hover]/menu-item:bg-sidebar-accent group-has-[[data-sidebar=menu-action]:hover]/menu-item:text-sidebar-accent-foreground"
              onClick={() => { if (transferRef.current) return; if (compact) { setOpenModule(id); onFollow(`/${id}/${order(id)[0]}`); } else setOpenModule(open ? "" : id); }}>
              <Icon /><span>{module.name}</span>
            </SidebarMenuButton>
            {!compact && handle("modules", id, module.name)}
            <CollapsibleTrigger render={<SidebarMenuAction className="hover:bg-transparent hover:text-sidebar-accent-foreground" aria-label={open ? "Свернуть раздел" : "Раскрыть раздел"} aria-expanded={open} />}>
              <ChevronDown className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            </CollapsibleTrigger>
            <CollapsibleContent><SidebarMenuSub>
              {order(id).map(section => {
                const name = module.sections.find(([key]) => key === section)![1];
                const SectionIcon = sectionIcons[section];
                const active = selectedId === id && sectionId === section;
                return <SidebarMenuSubItem key={section} {...target(id, section)}>
                  <SidebarMenuSubButton isActive={active} aria-current={active ? "page" : undefined} className={isMobile ? undefined : "pr-6"}
                    render={<Link to={`/${id}/${section}`} draggable={false} onClick={() => { if (isMobile) setOpenMobile(false); }} />}>
                    <SectionIcon /><span>{name}</span>
                  </SidebarMenuSubButton>
                  {handle(id, section, name)}
                </SidebarMenuSubItem>;
              })}
            </SidebarMenuSub></CollapsibleContent>
          </Collapsible>
        </SidebarMenuItem>;
      })}
    </SidebarMenu>
  </>;
}
