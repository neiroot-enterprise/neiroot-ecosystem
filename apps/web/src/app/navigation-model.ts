import {
  Banknote,
  Building2,
  ClipboardCheck,
  Factory,
  FileText,
  HandCoins,
  Handshake,
  Landmark,
  Network,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Module = {
  id: string;
  name: string;
  icon: LucideIcon;
  sections: readonly (readonly [string, string])[];
};
export const modules: Module[] = [
  {
    id: "company",
    name: "Моя экосистема",
    icon: Building2,
    sections: [
      ["structure", "Структура экосистемы"],
      ["businesses", "Предприятия"],
      ["employees", "Сотрудники"],
      ["organizations", "Организации"],
      ["contracts", "Договоры"],
      ["counterparties", "Контрагенты"],
      ["partners", "Партнеры"],
    ],
  },
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
    id: "sales",
    name: "Продажи",
    icon: ShoppingBag,
    sections: [
      ["invoices", "Счета на оплату"],
      ["acts", "Акты выполненных работ"],
      ["catalog", "Номенклатура"],
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
export const sectionIcons: Record<string, LucideIcon> = {
  employees: Users,
  businesses: Factory,
  organizations: Building2,
  contracts: FileText,
  counterparties: Handshake,
  catalog: Package,
  structure: Network,
  partners: Handshake,
  cash: Wallet,
  banks: Landmark,
  loans: HandCoins,
  payroll: Banknote,
  invoices: Receipt,
  acts: ClipboardCheck,
  fields: SlidersHorizontal,
  access: ShieldCheck,
};

export function completeOrder(saved: readonly string[] | undefined, available: readonly string[]): string[] {
  const remaining = new Set(available);
  return [...(saved ?? []), ...available].filter(id => remaining.delete(id));
}
