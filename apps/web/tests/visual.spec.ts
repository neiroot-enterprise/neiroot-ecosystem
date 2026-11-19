import { expect, test, type Page } from "@playwright/test";

const tenant = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Тестовая экосистема",
  role: "owner",
};
const secondTenant = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Другая экосистема с длинным названием для проверки ширины",
  role: "owner",
};
const employee = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Тестовый Сотрудник",
  lastName: "Тестовый",
  firstName: "Сотрудник",
  middleName: "",
  phone: "+79990000001",
  email: "employee@example.test",
  role: "user",
  accessState: "pending",
  invitationState: "pending",
  createdAt: "2026-10-02T12:00:00Z",
};

async function fixture(page: Page, role = "owner", employees = [employee]) {
  let activeTenantId = tenant.id;
  await page.route(/^http:\/\/127\.0\.0\.1:5173\/api\//, async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === "/api/v1/session") {
      await route.fulfill({
        json: {
          authenticated: true,
          subject: "synthetic-owner",
          fullName: "Тестов Алексей Петрович",
          firstName: "Алексей",
          lastName: "Тестов",
          phone: "+79990000000",
          email: "owner@example.test",
          tenants: [{ ...tenant, role }, { ...secondTenant, role }],
          csrfToken: "test-csrf",
          activeTenantId,
        },
      });
      return;
    }
    if (path === "/api/v1/session/tenant") {
      activeTenantId = request.postDataJSON().tenantId;
      await route.fulfill({ status: 204 });
      return;
    }
    if (path.endsWith("/employees") && request.method() === "GET") {
      await route.fulfill({
        json: {
          items: employees,
          total: employees.length,
          limit: Number(url.searchParams.get("limit") || 25),
          offset: Number(url.searchParams.get("offset") || 0),
        },
      });
      return;
    }
    if (path.endsWith(employee.id)) {
      await route.fulfill({ json: employee });
      return;
    }
    if (path.endsWith("/assignments")) {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if ((path.endsWith("/invitation") && request.method() === "GET") || path.endsWith("/invitation/refresh")) {
      await route.fulfill({json:{invitationUrl:"https://example.test/invite#token="+"a".repeat(64),expiresAt:"2026-11-18T12:00:00Z"}});
      return;
    }
    await route.fulfill({
      status: 403,
      json: {
        code: "forbidden",
        message: "Действие запрещено",
        requestId: "synthetic-request",
      },
    });
  });
}

test("desktop shell, expanded and collapsed Sidebar, placeholders", async ({
  page,
}) => {
  await fixture(page, "owner", [
    employee,
    {
      ...employee,
      id: "44444444-4444-4444-8444-444444444444",
      fullName: "Другой Сотрудник",
      lastName: "Другой",
      email: "another-employee@example.test",
    },
  ]);
  await page.goto("/company/employees");
  await expect(
    page.getByRole("heading", { name: "Сотрудники", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /Тестовый Сотрудник/, exact: false })
      .first(),
  ).toBeVisible();
  const tableLayout = await page.getByRole("table").evaluate((table) => {
    const card = table.closest('[data-slot="card"]')!;
    const header = card.querySelector(':scope > .sticky')!;
    const footer = card.querySelector(':scope > [data-slot="card-footer"]')!;
    const tableBounds = table.getBoundingClientRect();
    return {
      gapBeforeTable: tableBounds.top - header.getBoundingClientRect().bottom,
      gapAfterTable: footer.getBoundingClientRect().top - tableBounds.bottom,
      rowHeights: [...table.querySelectorAll("tbody tr")].map(
        (row) => row.getBoundingClientRect().height,
      ),
    };
  });
  expect(tableLayout.gapBeforeTable).toBe(0);
  expect(tableLayout.gapAfterTable).toBe(0);
  expect(tableLayout.rowHeights).toHaveLength(2);
  expect(tableLayout.rowHeights.every((height) => height >= 48)).toBe(true);
  await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
    "data-state",
    "expanded",
  );
  const profile = page.getByRole("button", { name: "Меню профиля", exact: true });
  const sidebarFooter = page.locator('[data-slot="sidebar-footer"]');
  await expect(sidebarFooter).toHaveCSS("height", "51px");
  await expect(profile.getByText("Тестов Алексей", { exact: true })).toBeVisible();
  const profileAvatar = profile.locator('[data-slot="avatar"]');
  await expect(profileAvatar).toHaveCSS("width", "34px");
  await expect(profileAvatar.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(profile.getByText(/Петрович|Владелец/)).toHaveCount(0);
  await profile.click();
  const profileMenu = page.getByRole("menu");
  await expect(profileMenu).toHaveAttribute("data-side", "right");
  await expect(
    profileMenu.getByRole("menuitem", { name: "Выход", exact: true }),
  ).toBeVisible();
  await expect(
    profileMenu.getByText("owner@example.test", { exact: true }),
  ).toBeVisible();
  await expect(profileMenu.getByText("Тестов Алексей")).toBeVisible();
  await expect(profileMenu.locator('[data-slot="avatar"]')).toBeVisible();
  await expect(profileMenu.locator('[data-slot="avatar-image"]')).toBeVisible();
  await page.screenshot({
    path: "test-results/sidebar-profile-menu.png",
    fullPage: true,
  });
  await profileMenu.getByRole("menuitem", { name: "Профиль", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole("region", { name: "Профиль", exact: true }).getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByText("owner@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Тестов Алексей Петрович", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Сотрудники", exact: true })).not.toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.getByRole("region", { name: "Профиль", exact: true }).getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: "test-results/account-profile.png" });
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Сотрудники", exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/employees-desktop-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Свернуть меню" }).click();
  await expect(page.locator('[data-slot="sidebar"]')).toHaveAttribute(
    "data-state",
    "collapsed",
  );
  await expect(
    page.getByRole("button", { name: "Развернуть меню", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveCSS(
    "width",
    "48px",
  );
  await expect(sidebarFooter).toHaveCSS("height", "51px");
  await expect(profile).toHaveCSS("width", "34px");
  await profile.click();
  await expect(profileMenu).toHaveAttribute("data-side", "right");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/employees-desktop-collapsed.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+b");
  await page.getByRole("button", { name: "Деньги", exact: true }).click();
  await page.getByRole("link", { name: "Касса", exact: true }).click();
  await expect(
    page.getByText("Этот раздел появится на следующем этапе."),
  ).toBeVisible();
  const search = page.getByRole("combobox", { name: "Экосистема", exact: true });
  const field = search.locator("..");
  await expect(search).toHaveValue(tenant.name);
  await expect(field).toHaveCSS("width", "215px");
  await search.fill("автоатрибут");
  await expect(
    page.getByRole("option", { name: "Автоатрибут Демо" }),
  ).toBeDisabled();
  await search.fill("несуществующая");
  await expect(page.getByText("Экосистемы не найдены")).toBeVisible();
  await search.fill("другая");
  await expect(page.getByRole("option")).toHaveText([secondTenant.name]);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(
    page.getByText(`Команда экосистемы «${secondTenant.name}»`),
  ).toBeVisible();
  await expect(search).toHaveValue(secondTenant.name);
  await expect(field).toHaveCSS("width", "215px");
});

test("dark theme is saved and restored", async ({ page }) => {
  await fixture(page);
  await page.goto("/company/employees");
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/employees-desktop-dark.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("neiroot-theme"))).toBe(
    "dark",
  );
  await page.goto("/account/profile");
  await expect(page.getByRole("region", { name: "Профиль", exact: true }).getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/account/notifications");
  await expect(page.getByRole("heading", { name: "Уведомления", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("form validates input and preserves fields on API refusal", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/company/employees/new");
  await page
    .getByRole("button", { name: "Создать сотрудника", exact: true })
    .click();
  await expect(
    page.getByText("Укажите фамилию", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Фамилия *", { exact: true }).fill("Новый Тестовый");
  await page.getByLabel("Имя *", { exact: true }).fill("Иван");
  const phone = page.getByLabel("Телефон *", { exact: true });
  await phone.fill("+7abc45678900987765434567876545678");
  await expect(phone).toHaveValue("+7 (456) 789-00-98");
  await phone.pressSequentially("abc123");
  await expect(phone).toHaveValue("+7 (456) 789-00-98");
  await phone.press("Backspace");
  await phone.blur();
  await expect(phone).toHaveValue("+7 (456) 789-00-9");
  await page.getByLabel("Телефон *", { exact: true }).fill("+79990000003");
  await page.getByLabel("Email *", { exact: true }).fill("new@example.test");
  await page
    .getByRole("button", { name: "Создать сотрудника", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Действие запрещено");
  await expect(page.getByLabel("Фамилия *", { exact: true })).toHaveValue(
    "Новый Тестовый",
  );
  await page.screenshot({
    path: "test-results/employee-form-desktop.png",
    fullPage: true,
  });
});

test("invitation error keeps cancellation in the header and supports retry", async ({ page }) => {
  await fixture(page);
  let fail = true;
  await page.route("**/invitation/refresh", async (route) => {
    if (!fail) return route.fallback();
    await route.fulfill({ status: 503, json: {
      code: "unavailable", message: "Сервис временно недоступен", requestId: "synthetic-request",
    } });
  });
  await page.goto(`/company/employees/${employee.id}`);
  const connection = page.getByRole("region", { name: "Подключение сотрудника", exact: true });
  const header = connection.locator('[data-slot="card-header"]');
  const content = connection.locator('[data-slot="card-content"]');
  const cancel = header.getByRole("button", { name: "Отменить приглашение", exact: true });
  await expect(content.getByRole("alert")).toBeVisible();
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveCSS("height", "24px");
  await expect(content.getByRole("button")).toHaveText(["Повторить загрузку"]);
  await expect(header.getByRole("button", { name: "Копировать ссылку" })).toHaveCount(0);
  await cancel.click();
  const confirmation = page.getByRole("alertdialog", { name: "Отменить приглашение?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Оставить", exact: true }).click();
  fail = false;
  await content.getByRole("button", { name: "Повторить загрузку" }).click();
  await expect(connection.getByRole("textbox", { name: "Ссылка приглашения" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Копировать ссылку" })).toBeVisible();
  await expect(cancel).toHaveCSS("height", "24px");
  await expect(content.getByRole("button")).toHaveCount(0);
});

test("invitation success dialog copies the URL and opens either destination", async ({ page, context }) => {
  const invitationUrl = "https://example.test/invite#token=" + "a".repeat(64);
  await fixture(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(`**/tenants/${tenant.id}/employees`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 201, json: { employee, invitationUrl } });
  });
  for (const destination of ["Карточка сотрудника", "Список сотрудников"]) {
    await page.goto("/company/employees/new");
    await page.getByLabel("Фамилия *", { exact: true }).fill(employee.lastName);
    await page.getByLabel("Имя *", { exact: true }).fill(employee.firstName);
    await page.getByLabel("Телефон *", { exact: true }).fill(employee.phone);
    await page.getByLabel("Email *", { exact: true }).fill(employee.email);
    await page.getByRole("button", { name: "Создать сотрудника" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Сотрудник создан" });
    await expect(dialog.getByRole("textbox", { name: "Ссылка приглашения" })).toHaveValue(invitationUrl);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Копировать ссылку" }).click();
    await expect(dialog.getByRole("button", { name: "Скопировано" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitationUrl);
    await page.evaluate(() => navigator.clipboard.writeText("other fixture text"));
    await expect(dialog.getByRole("button", { name: "Копировать ссылку" })).toBeVisible();
    await dialog.getByRole("button", { name: "Копировать ссылку" }).click();
    await expect(dialog.getByRole("button", { name: "Скопировано" })).toBeVisible();
    await page.evaluate(() => navigator.clipboard.writeText("replacement fixture"));
    await expect(dialog.getByRole("button", { name: "Копировать ссылку" })).toBeVisible();
    await dialog.getByRole("link", { name: destination }).click();
    const path = destination === "Карточка сотрудника" ? `/company/employees/${employee.id}` : "/company/employees";
    await expect(page).toHaveURL(new URL(path, page.url()).href);
    await expect(dialog).toHaveCount(0);
  }
});

test("user cannot create or change access, employee card is readable", async ({
  page,
}) => {
  await fixture(page, "user");
  await page.goto(`/company/employees/${employee.id}?tab=access`);
  await expect(
    page.getByRole("heading", { name: "Тестовый Сотрудник", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Добавить сотрудника", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Сохранить роль" }),
  ).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const cards = page.locator('main [data-slot="card"]');
  const headings = [
    employee.fullName,
    "Личные данные",
    "Предприятия и отделы",
    "Подключение сотрудника",
  ];
  await expect(cards).toHaveCount(headings.length);
  for (const [index, name] of headings.entries()) {
    await expect(
      cards.nth(index).getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const [header, ...sections] = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().toJSON()),
    );
    let previousBottom = header.bottom;
    for (const section of sections) {
      expect(section.x).toBeCloseTo(header.x, 0);
      expect(section.width).toBeCloseTo(header.width, 0);
      expect(section.top).toBeGreaterThan(previousBottom);
      previousBottom = section.bottom;
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("account profile matches the employee card layout in both themes", async ({ page }) => {
  await fixture(page);
  await page.goto("/account/profile");

  const geometry = async () => {
    const heading = page.getByRole("heading", { level: 1 });
    const header = heading.locator('xpath=ancestor::*[@data-slot="card"]');
    const personal = page.getByRole("region", { name: "Личные данные", exact: true });
    await expect(personal).toBeVisible();
    const headerStyle = await header.evaluate(card => {
      const name = card.querySelector("h1")!;
      const avatar = card.querySelector('[data-slot="avatar"], button')!;
      return {
        width: card.getBoundingClientRect().width,
        nameSize: getComputedStyle(name).fontSize,
        nameWeight: getComputedStyle(name).fontWeight,
        avatarSize: avatar.getBoundingClientRect().width,
      };
    });
    const personalStyle = await personal.evaluate(card => {
      const content = card.querySelector('[data-slot="card-content"]')!;
      const field = Array.from(content.querySelectorAll("dt"))
        .find(term => term.textContent === "Email")!;
      const value = field.nextElementSibling!.firstElementChild!;
      return {
        width: card.getBoundingClientRect().width,
        columns: getComputedStyle(content).gridTemplateColumns,
        inset: getComputedStyle(content).paddingInlineStart,
        rowGap: getComputedStyle(content.firstElementChild!.children[1]).marginBlockStart,
        headingSize: getComputedStyle(card.querySelector("h2")!).fontSize,
        labelSize: getComputedStyle(field).fontSize,
        valueSize: getComputedStyle(value).fontSize,
        valueHeight: value.getBoundingClientRect().height,
      };
    });
    return { headerStyle, personalStyle };
  };

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => localStorage.setItem("neiroot-theme", theme), theme);
      await page.goto(`/company/employees/${employee.id}`);
      const reference = await geometry();
      await page.goto("/account/profile");
      expect(await geometry()).toEqual(reference);
      await expect(page.getByText("owner@example.test", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});

test("inline personal data preview keeps the card and all five fields in place", async ({ page }) => {
  await fixture(page);
  await page.goto(`/company/employees/${employee.id}`);
  const card = page.getByRole("region", { name: "Личные данные", exact: true });
  const name = card.getByLabel("Имя", { exact: true });
  const save = card.getByRole("button", { name: "Сохранить", exact: true });
  const cancel = card.getByRole("button", { name: "Отмена", exact: true });
  await expect(card.getByRole("textbox")).toHaveCount(5);
  await expect(card.getByRole("combobox", { name: "Роль в экосистеме" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const geometry = () => card.evaluate(el =>
    [el, ...el.querySelectorAll("input")].map(node => {
      const { left, top, width, height } = node.getBoundingClientRect();
      return [left + scrollX, top + scrollY, width, height];
    }),
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const before = await geometry();
    await name.focus();
    await expect(save).toHaveCount(0);
    await name.fill("Черновик");
    await expect(save).toBeVisible();
    expect(await geometry()).toEqual(before);
    for (const button of [cancel, save]) expect((await button.boundingBox())!.height).toBe(24);
    await card.screenshot({ path: `test-results/personal-edit-${width}.png` });
    await cancel.click();
    await expect(name).toHaveValue(employee.firstName);
    await expect(cancel).toHaveCount(0);
    expect(await geometry()).toEqual(before);
  }
  await name.fill("Черновик");
  await name.fill(employee.firstName);
  await expect(save).toHaveCount(0);
  await name.fill("Локальное имя");
  await save.click();
  await expect(name).toHaveValue("Локальное имя");
  await expect(save).toHaveCount(0);
  await page.reload();
  await expect(name).toHaveValue(employee.firstName);
});

test("390 px mobile cards and keyboard drawer have no horizontal overflow", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/company/employees");
  await expect(
    page.getByRole("heading", { name: "Сотрудники", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Открыть карточку", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/employees-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(
    page.getByRole("dialog", { name: "Главное меню" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Главное меню" })
      .getByRole("button", { name: "Меню профиля", exact: true })
      .getByText("Тестов Алексей", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/sidebar-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Меню профиля" }).click();
  const mobileProfileMenu = page.getByRole("menu");
  await expect(mobileProfileMenu).toHaveAttribute("data-side", "top");
  await mobileProfileMenu.getByRole("menuitem", { name: "Уведомления", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/notifications$/);
  await expect(page.getByRole("heading", { name: "Уведомления", exact: true })).toBeVisible();
  await expect(page.getByText("Лента уведомлений пока недоступна.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Главное меню" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/account-notifications-mobile.png", animations: "disabled" });
  const ecosystem = page.getByRole("combobox", {
    name: "Экосистема",
    exact: true,
  });
  await ecosystem.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("dirty form requires confirmation before navigation", async ({ page }) => {
  await fixture(page);
  await page.goto("/company/employees/new");
  await page
    .getByLabel("Фамилия *", { exact: true })
    .fill("Несохранённая карточка");
  await page
    .getByRole("link", { name: "Список сотрудников", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Есть несохранённые данные",
  );
  await expect(page.getByRole("alertdialog")).toHaveAttribute("data-size", "sm");
  await expect(page.getByRole("button", { name: "Продолжить" })).toBeFocused();
  await page.locator('[data-slot="alert-dialog-overlay"]').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByLabel("Фамилия *", { exact: true })).toHaveValue("Несохранённая карточка");
  const ecosystem = page.getByRole("combobox", {
    name: "Экосистема",
    exact: true,
  });
  await ecosystem.fill("другая");
  await page.getByRole("option", { name: secondTenant.name }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Сменить экосистему?",
  );
  await expect(page.getByRole("alertdialog")).toHaveAttribute("data-size", "sm");
  await page.locator('[data-slot="alert-dialog-overlay"]').click({ position: { x: 5, y: 5 } });
  await expect(ecosystem).toHaveValue(tenant.name);
  await expect(page.getByLabel("Фамилия *", { exact: true })).toHaveValue(
    "Несохранённая карточка",
  );
});


test("employee avatar can be previewed, saved and removed", async ({ page }) => {
  await fixture(page);
  await page.goto(`/company/employees/${employee.id}`);
  await page.getByRole("button", { name: "Изменить фото сотрудника" }).click();
  await expect(page.getByRole("dialog", { name: "Фото сотрудника" })).toBeVisible();
  await page.getByLabel("Выбрать фотографию", { exact: true }).setInputFiles({
    name: "avatar.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")
  });
  const dialog = page.getByRole("dialog", { name: "Фото сотрудника" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toBeVisible();
  await dialog.getByRole("button", { name: "Заменить фото", exact: true }).hover();
  const tooltip = page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Заменить фото" });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute("data-side", "right");
  expect(await tooltip.evaluate((el) => getComputedStyle(el).backgroundColor === getComputedStyle(el.lastElementChild!).backgroundColor)).toBe(true);
  await page.screenshot({ path: "test-results/avatar-tooltip.png" });
  const image = dialog.getByRole("img");
  const frame = (await image.locator("..").boundingBox())!;
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(192);
  const source = await image.getAttribute("src");
  const before = await image.getAttribute("style");
  const box = (await image.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 20, center.y + 10);
  await page.mouse.up();
  await expect(image).not.toHaveAttribute("style", before!);
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Изменить фото сотрудника" }).click();
  await expect(dialog).toBeVisible();
  await expect(image).toHaveAttribute("src", source!);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(192);
  const reopenedFrame = (await image.locator("..").boundingBox())!;
  await page.mouse.move(reopenedFrame.x + 96, reopenedFrame.y + 96);
  await page.mouse.wheel(0, 1000);
  await expect.poll(async () => Math.round((await image.boundingBox())!.width)).toBe(192);
  await dialog.getByRole("button", { name: "Удалить фото" }).click();
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Изменить фото сотрудника" }).locator("img")).toHaveCount(0);
});

test("column settings toggle table fields, preserve label spacing and survive reload", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/\/api\/v1\/tenants\/[^/]+\/(businesses|organizations)\?/, route => route.fulfill({
    json: { items: [{ id: 'demo', name: 'Пример', inn: '9900001010', archived: false }], total: 1, limit: 25, offset: 0 },
  }));

  for (const [section, label] of [['employees', 'Телефон'], ['businesses', 'Состояние'], ['organizations', 'ИНН']]) {
    await page.goto(`/company/${section}`);
    const settings = page.getByRole('button', { name: 'Настроить столбцы' });
    const checkbox = page.getByRole('menuitemcheckbox', { name: label, exact: true });
    const table = page.getByRole('table');
    await expect(table.locator('tbody tr').first()).toBeVisible();
    const columnCount = await table.locator('tbody tr').first().locator('td').count();
    await expect(settings).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await settings.hover();
    await expect(settings).toHaveCSS('background-color', 'rgb(240, 242, 244)');

    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    const longest = page.getByRole('menuitemcheckbox', {
      name: section === 'employees' ? 'Подключение' : 'Состояние',
      exact: true,
    });
    await expect.poll(() => longest.evaluate(item => {
      const indicator = item.querySelector<HTMLElement>('[data-slot="dropdown-menu-checkbox-item-indicator"]')!;
      const label = item.lastElementChild as HTMLElement;
      return indicator.offsetLeft - label.offsetLeft - label.offsetWidth;
    })).toBeGreaterThanOrEqual(8);
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(columnCount - 1);
    await page.keyboard.press('Escape');
    await expect(settings).toBeFocused();
    await page.reload();
    await settings.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('menuitem', { name: 'Восстановить по умолчанию' })).toHaveCount(0);
    const menu = page.getByRole('menu');
    const labelElement = menu.locator('[data-slot="dropdown-menu-label"]');
    await expect(labelElement).toHaveCSS('padding-top', '4px');
    await expect(labelElement).toHaveCSS('padding-bottom', '4px');
    expect(await menu.locator('[data-slot="dropdown-menu-separator"]').count()).toBe(1);
    await checkbox.click();
    await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(columnCount);
  }
});

test("employee list uses the compact header with a responsive search field", async ({ page }) => {
  await fixture(page);
  await page.goto("/company/employees");
  const search = page.getByRole("textbox", { name: "Поиск сотрудников", exact: true });
  const header = page.locator('[data-slot="card-header"]').filter({ has: search });
  const card = page.locator('[data-employee-list] > [data-slot="card"]');
  const footer = card.locator(':scope > [data-slot="card-footer"]');
  await expect(card).toHaveAttribute("data-size", "sm");
  await expect(footer).toHaveCSS("padding-top", "12px");
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
      await expect(header).toHaveCSS("padding-bottom", "12px");
      const title = header.locator('[data-slot="card-title"]');
      await expect(title).toHaveCSS("font-size", "14px");
      const titleBox = (await title.boundingBox())!;
      const description = (await header.locator('[data-slot="card-description"]').boundingBox())!;
      const field = (await search.boundingBox())!;
      const bounds = (await card.boundingBox())!;
      expect(titleBox.y - bounds.y).toBe(12);
      expect(titleBox.x - bounds.x).toBe(12);
      const settings = await header.locator('button[aria-label="Настроить столбцы"]').boundingBox();
      const rightmost = settings ?? field;
      expect(Math.round(bounds.x + bounds.width - rightmost.x - rightmost.width)).toBe(12);
      expect(field.height).toBe(32);
      if (width >= 640) {
        expect(field.width).toBe(320);
        const headingCenter = (titleBox.y + description.y + description.height) / 2;
        expect(Math.abs(field.y + field.height / 2 - headingCenter)).toBeLessThanOrEqual(1);
      } else {
        expect(field.x).toBe(titleBox.x);
        expect(field.y).toBeGreaterThan(description.y + description.height);
      }
    }
  }
});

test("employee pagination restores scroll when returning from a shorter page", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route(`**/tenants/${tenant.id}/employees?*`, async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset"));
    await route.fulfill({ json: {
      items: Array.from({ length: offset ? 3 : 25 }, (_, i) => ({
        ...employee, id: `fixture-${offset + i}`, fullName: `Сотрудник ${offset + i}`
      })),
      total: 28, limit: 25, offset
    } });
  });
  await page.goto("/company/employees");
  await page.getByRole("button", { name: "Следующая страница", exact: true }).scrollIntoViewIfNeeded();
  const scrollViewport = page.getByRole("region", { name: "Прокрутка списка сотрудников", exact: true });
  const previousScroll = await scrollViewport.evaluate((node) => node.scrollTop);
  expect(previousScroll).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/employees-sticky-header.png" });
  await expect.poll(() => page.locator('[data-slot="card"] > .sticky').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(56);
  await expect(page.getByRole("textbox", { name: "Поиск сотрудников" })).toBeInViewport();

  await page.getByRole("button", { name: "Следующая страница", exact: true }).click();
  await expect(page.getByText("Страница 2 из 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Предыдущая страница", exact: true }).click();
  await expect(page.getByText("Страница 1 из 2", { exact: true })).toBeVisible();
  await expect.poll(() => scrollViewport.evaluate((node) => node.scrollTop)).toBe(previousScroll);
});

test("employee table fits on desktop and email is available in the card", async ({ page }) => {
  await fixture(page);
  await page.goto("/company/employees");
  const table = page.getByRole("table");
  const action = table.getByRole("link", { name: `Открыть карточку ${employee.fullName}`, exact: true });
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(action).toBeInViewport();
    expect(await table.locator("..").locator("..").evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    await expect(table.getByRole("columnheader", { name: "Email" })).toHaveCount(0);
    await expect(table.getByText(employee.email, { exact: true })).toHaveCount(0);
  }
  await action.click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(employee.email);
});

test("employee column widths stay stable when switching page size", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(`**/tenants/${tenant.id}/employees?*`, async (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get("limit"));
    await route.fulfill({ json: {
      items: Array.from({ length: limit }, (_, i) => ({
        ...employee, id: `fixture-${i}`,
        fullName: i < 25 ? employee.fullName : "Очень длинная фамилия сотрудника с дополнительными именами",
        role: i < 25 ? "user" : "admin"
      })), total: 60, limit, offset: 0
    } });
  });
  await page.goto("/company/employees");
  const widths = () => page.locator('table[aria-hidden="true"] thead th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  await expect(page.locator("tbody tr")).toHaveCount(25);
  const initial = await widths();
  expect(initial).toHaveLength(5);
  expect(initial[0]).toBeGreaterThan(initial[1]);
  expect(initial[1]).toBeGreaterThan(initial[2]);
  expect(initial[4]).toBeCloseTo(48, 0);
  expect(await page.locator("tbody tr").first().locator("td").nth(1).locator("span").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("combobox", { name: "Количество сотрудников на странице" }).click();
  await page.getByRole("option", { name: "50", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  expect(await widths()).toEqual(initial);
  const longRow = page.locator("tbody tr").last();
  expect(await longRow.locator("td").nth(0).locator("span").last().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("combobox", { name: "Количество сотрудников на странице" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  expect(await widths()).toEqual(initial);
});

test("employee search keeps horizontal layout when the page scrollbar disappears", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  let releaseResponse = () => {};
  let waitingForResponse = false;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`**/tenants/${tenant.id}/employees?*`, async (route) => {
    const search = new URL(route.request().url()).searchParams.get("search");
    if (search === "Ивано") {
      waitingForResponse = true;
      await responseGate;
    }
    const count = search ? ("Иванов".startsWith(search) ? 1 : 0) : 25;
    await route.fulfill({ json: {
      items: Array.from({ length: count }, (_, i) => ({
        ...employee, id: `fixture-${i}`, fullName: i ? `Тестовый Сотрудник ${i}` : "Иванов Иван Иванович"
      })),
      total: count, limit: 25, offset: 0
    } });
  });
  await page.goto("/company/employees");
  await expect(page.locator("tbody tr")).toHaveCount(25);
  const geometry = async () => {
    const elements = [
      page.getByRole("link", { name: "Добавить сотрудника", exact: true }),
      page.getByRole("textbox", { name: "Поиск сотрудников", exact: true }),
      page.getByRole("table")
    ];
    return Promise.all(elements.map((element) => element.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, width: bounds.width };
    })));
  };
  const before = await geometry();
  const viewport = page.getByRole("region", { name: "Прокрутка списка сотрудников", exact: true });
  expect(await viewport.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  const search = page.getByRole("textbox", { name: "Поиск сотрудников", exact: true });
  await search.fill("Иванов");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
  expect(await geometry()).toEqual(before);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter)).toBe("auto");
  const margins = await page.locator("[data-employee-list]").evaluate((node) => {
    const main = node.closest("main")!.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    return { left: bounds.left - main.left, right: main.right - bounds.right };
  });
  expect(margins.left).toBe(margins.right);
  await search.press("Backspace");
  await expect.poll(() => waitingForResponse).toBe(true);
  try {
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("status", { name: "Загрузка сотрудников" })).toHaveCount(0);
    expect(await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
    expect(await geometry()).toEqual(before);
  } finally {
    releaseResponse();
  }
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await search.fill("Несуществующий");
  await expect(page.getByText("Ничего не найдено", { exact: true })).toBeVisible();
  const emptyButton = await page.getByRole("link", { name: "Добавить сотрудника", exact: true }).boundingBox();
  expect({ x: emptyButton!.x, width: emptyButton!.width }).toEqual(before[0]);
  await search.clear();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  expect(await geometry()).toEqual(before);
});

for (const catalog of [
  {kind:'businesses', singular:'предприятие', plural:'предприятий'},
  {kind:'organizations', singular:'организацию', plural:'организаций'},
]) test(`${catalog.kind} design: themes, narrow list, errors and protected draft`, async ({page}) => {
  await fixture(page);
  let fail = false;
  await page.route(`**/api/v1/tenants/*/${catalog.kind}?*`, async route => {
    if (fail) return route.fulfill({status:503,json:{message:'Предприятия временно недоступны'}});
    const search = new URL(route.request().url()).searchParams.get('search');
    await route.fulfill({json:{items:search ? [] : [{id:'enterprise-demo',name:'Производство и обслуживание оборудования',inn:'9900001010',archived:false}], total:search?0:1,limit:25,offset:0}});
  });
  const appearance = (element: HTMLElement | SVGElement) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector('svg')!;
    return {
      height: element.getBoundingClientRect().height,
      fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight,
      paddingLeft: style.paddingLeft, paddingRight: style.paddingRight,
      gap: style.gap, borderRadius: style.borderRadius,
      iconWidth: icon.getBoundingClientRect().width, iconHeight: icon.getBoundingClientRect().height,
    };
  };
  for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/company/employees');
    const reference = await page.getByRole('link',{name:'Добавить сотрудника',exact:true}).first().evaluate(appearance);
    await page.goto(`/company/${catalog.kind}`);
    const actual = await page.getByRole('button',{name:`Добавить ${catalog.singular}`,exact:true}).evaluate(appearance);
    expect(actual.height).toBe(40);
    expect(actual).toEqual(reference);
  }
  await expect(page.getByRole('link',{name:'Производство и обслуживание оборудования',exact:true})).toBeVisible();
  for (const width of [1280,768,390]) {
    await page.setViewportSize({width,height:900});
    for (const dark of [false,true]) {
      await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
      await page.waitForTimeout(300); // Capture settled theme colors.
      await expect(page.getByRole('textbox',{name:`Поиск ${catalog.plural}`,exact:true})).toHaveCSS('height','32px');
      {
        const toolbar=page.getByRole('group',{name:'Поиск и фильтры',exact:true});
        const card=page.locator('[data-slot="card"]').filter({has:toolbar});
        await expect(card).toHaveAttribute('data-size','sm');
        expect(await card.evaluate(element=>{
          const header=element.querySelector('[data-slot="card-header"]')!;
          const title=header.querySelector('[data-slot="card-title"]')!;
          return {top:title.getBoundingClientRect().top-element.getBoundingClientRect().top,bottom:parseFloat(getComputedStyle(header).paddingBottom),left:parseFloat(getComputedStyle(header).paddingLeft),footer:parseFloat(getComputedStyle(element.querySelector('[data-slot="card-footer"]')!).paddingTop)};
        })).toEqual({top:12,bottom:12,left:12,footer:12});

        const searchBox=await toolbar.getByRole('textbox').boundingBox();
        const filterBox=await toolbar.getByRole('combobox',{name:'Состояние'}).boundingBox();
        if(width>=640) {
          expect(searchBox!.y).toBe(filterBox!.y);
          const header=toolbar.locator('xpath=ancestor::*[@data-slot="card-header"]');
          const headerBox=await header.boundingBox();
          const settingsBox = (await toolbar.getByRole('button', {name:'Настроить столбцы'}).boundingBox())!;
          expect(Math.round(headerBox!.x+headerBox!.width-settingsBox.x-settingsBox.width)).toBe(12);
          expect(settingsBox.x-filterBox!.x-filterBox!.width).toBe(8);
          if(width>=1024) {
            const titleBox=await header.locator('[data-slot="card-title"]').boundingBox();
            const descriptionBox=await header.locator('[data-slot="card-description"]').boundingBox();
            const headingCenter=(titleBox!.y+descriptionBox!.y+descriptionBox!.height)/2;
            expect(Math.abs(searchBox!.y+searchBox!.height/2-headingCenter)).toBeLessThanOrEqual(1);
          }
        }
        else expect(filterBox!.y-searchBox!.y-searchBox!.height).toBe(8);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/${catalog.kind}-${width}-${dark?'dark':'light'}.png`,fullPage:true});
      {
        const state=page.getByRole('combobox',{name:'Состояние',exact:true});
        expect((await state.boundingBox())!.height).toBe(32);
        const stateWidth=(await state.boundingBox())!.width;
        expect(stateWidth).toBeLessThan(192);
        await state.focus();
        await page.keyboard.press('Space');
        const popup=page.locator('[data-slot="select-content"]');
        await expect(popup).toBeVisible();
        await expect(popup).toHaveAttribute('data-align-trigger','true');
        await expect(state).toHaveCSS('opacity','0');
        await expect(popup.locator('[data-slot="select-label"]')).toHaveText('Состояние');
        await page.screenshot({path:`test-results/${catalog.kind}-select-${width}-${dark?'dark':'light'}.png`,fullPage:true});
        await page.keyboard.press('Escape');
        await expect(state).toBeFocused();
        await expect(state).toHaveCSS('opacity','1');
        if(width===1280&&!dark) {
          for(const label of ['Архив','Все','Действующие']) {
            await state.click();
            await page.getByRole('option',{name:label,exact:true}).click();
            await expect(state.locator('[data-slot="select-value"]')).toHaveText(label);
            expect((await state.boundingBox())!.width).toBe(stateWidth);
          }
        }

      }
      if (catalog.kind==='businesses') {
        const listTab=page.getByRole('tab',{name:'Список предприятий',exact:true});
        const departmentsTab=page.getByRole('tab',{name:'Отделы',exact:true});
        const tabSpacing=()=>page.locator('nav[data-slot="tabs"]').evaluate(element=>{
          const bounds=element.getBoundingClientRect();
          return {
            above:bounds.top-element.previousElementSibling!.getBoundingClientRect().bottom,
            below:element.nextElementSibling!.getBoundingClientRect().top-bounds.bottom,
          };
        });
        expect(await tabSpacing()).toEqual({above:8,below:8});
        await expect(listTab).toHaveAttribute('aria-selected','true');
        await listTab.focus();
        await page.keyboard.press('ArrowRight');
        await expect(departmentsTab).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/company\/businesses\/departments$/);
        await expect(departmentsTab).toHaveAttribute('aria-selected','true');
        expect(await tabSpacing()).toEqual({above:8,below:8});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`test-results/departments-tabs-${width}-${dark?'dark':'light'}.png`,fullPage:true});
        await listTab.click();
        await expect(page).toHaveURL(/\/company\/businesses$/);
        await expect(listTab).toHaveAttribute('aria-selected','true');
      }
    }
  }
  await page.getByRole('button',{name:`Добавить ${catalog.singular}`}).focus();
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Наименование').fill('Черновик предприятия');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button',{name:'Продолжить редактирование'}).click();
  await expect(dialog.getByLabel('Наименование')).toHaveValue('Черновик предприятия');
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.getByRole('button',{name:'Отменить',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:`Добавить ${catalog.singular}`})).toBeFocused();
  await page.getByRole('textbox',{name:`Поиск ${catalog.plural}`,exact:true}).fill('Нет такого предприятия');
  await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
  fail=true;
  await page.getByRole('textbox',{name:`Поиск ${catalog.plural}`,exact:true}).fill('Ошибка');
  await expect(page.getByRole('button',{name:'Повторить',exact:true})).toBeVisible();
  fail=false;
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
});

for (const kind of ['organizations','businesses']) test(`${kind}: pagination keeps footer visible on return`, async ({page}) => {
  await fixture(page);
  await page.route(`**/api/v1/tenants/*/${kind}?*`, async route => {
    const params=new URL(route.request().url()).searchParams;
    const limit=Number(params.get('limit')),offset=Number(params.get('offset'));
    await new Promise(resolve=>setTimeout(resolve,150));
    const items=Array.from({length:15},(_,i)=>({id:`item-${i}`,name:`Организация с длинным наименованием для проверки переноса строк ${i}`,inn:'9900001010',archived:false}));
    await route.fulfill({json:{items:items.slice(offset,offset+limit),total:15,limit,offset}});
  });
  await page.setViewportSize({width:390,height:650});
  await page.goto(`/company/${kind}`);
  await expect(page.getByText('Страница 1 из 1',{exact:true})).toBeVisible();
  const state=page.getByRole('combobox',{name:'Состояние',exact:true});
  await state.click();
  const popup=page.locator('[data-slot="select-content"]');
  await expect(popup).toBeVisible();
  {
    await expect(popup).toHaveAttribute('data-align-trigger','true');
    expect((await state.boundingBox())!.height).toBe(32);
    await expect(popup.locator('[data-slot="select-group"]')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(state).toBeFocused();
  await page.getByRole('combobox').last().click();
  await page.getByRole('option',{name:'10',exact:true}).click();
  await expect(page.getByText('Страница 1 из 2',{exact:true})).toBeVisible();
  const next=page.getByRole('button',{name:'Следующая страница',exact:true});
  const previous=page.getByRole('button',{name:'Предыдущая страница',exact:true});
  await next.click();
  await expect(page.getByText('Страница 2 из 2',{exact:true})).toBeVisible();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(next).toBeEnabled();
  await expect(page.getByText('Страница 1 из 2',{exact:true})).toBeVisible();
  await expect.poll(()=>next.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true);
});

test('shared list pagination: enterprise requests, filters and compact catalog appearance', async ({page}) => {
  await fixture(page);
  await page.route('**/api/v1/tenants/*/organizations?*', route => route.fulfill({
    json: { items: [{ id: 'org-demo', name: 'Организация', inn: '9900001010', archived: false }], total: 1, limit: 25, offset: 0 },
  }));
  const requests: {limit:number;offset:number;search:string;status:string}[]=[];
  let delayNext=false;
  await page.route('**/api/v1/tenants/*/businesses?*', async route => {
    const params=new URL(route.request().url()).searchParams;
    const limit=Number(params.get('limit')),offset=Number(params.get('offset'));
    const search=params.get('search')||'',status=params.get('status')||'active';
    requests.push({limit,offset,search,status});
    if(delayNext){delayNext=false;await new Promise(resolve=>setTimeout(resolve,700));}
    const all=Array.from({length:61},(_,index)=>({id:`business-${index}`,name:`Предприятие ${index+1}`,archived:status==='archived'}));
    const filtered=search?all.filter(item=>item.name===search):all;
    await route.fulfill({json:{items:filtered.slice(offset,offset+limit),total:filtered.length,limit,offset}});
  });
  const footer=page.locator('[data-slot="card-footer"]').filter({has:page.getByRole('button',{name:'Следующая страница',exact:true})});
  const appearance=(element:HTMLElement|SVGElement)=>{
    const style=getComputedStyle(element);
    const button=element.querySelector('button[aria-label="Следующая страница"]')!;
    const buttonStyle=getComputedStyle(button);
    return {padding:style.padding,background:style.backgroundColor,border:style.borderTopWidth,
      direction:style.flexDirection,gap:style.gap,font:buttonStyle.fontSize,
      buttonHeight:button.getBoundingClientRect().height,radius:buttonStyle.borderRadius};
  };
  await page.goto('/company/organizations');
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>localStorage.setItem('neiroot-theme',theme),theme);
      await page.goto('/company/organizations');
      await expect(footer).toBeVisible();
      const reference=await footer.evaluate(appearance);
      const headerAppearance=(element:HTMLElement|SVGElement)=>{
        const card=element.closest('[data-slot="card"]')!.getBoundingClientRect();
        const bounds=element.getBoundingClientRect();
        const input=element.querySelector('input')!;
        const field=input.getBoundingClientRect(),style=getComputedStyle(input);
        const title=getComputedStyle(element.querySelector('[data-slot="card-title"]')!);
        return {left:bounds.left-card.left,right:card.right-bounds.right,
          inputWidth:field.width,inputHeight:field.height,rightInset:card.right-field.right,
          inputPadding:style.paddingLeft,titleFont:title.fontSize,titleWeight:title.fontWeight,
          border:getComputedStyle(element).borderBottomWidth};
      };
      const referenceHeader=await page.locator('[data-slot="card-header"]').filter({has:page.getByRole('textbox',{name:'Поиск организаций',exact:true})}).evaluate(headerAppearance);
      await page.goto('/company/businesses');
      await expect(footer).toBeVisible();
      expect(await footer.evaluate(appearance)).toEqual(reference);
      const enterpriseHeader=page.locator('[data-slot="card-header"]').filter({has:page.getByRole('textbox',{name:'Поиск предприятий',exact:true})});
      expect(referenceHeader.inputHeight).toBe(32);
      expect(await enterpriseHeader.evaluate(headerAppearance)).toEqual(referenceHeader);
      const tableEdges=await page.getByRole('table').evaluate(element=>{
        const card=element.closest('[data-slot="card"]')!.getBoundingClientRect();
        return [...element.querySelectorAll('tr')].every(row=>{
          const bounds=row.getBoundingClientRect();
          return Math.abs(bounds.left-card.left)<1&&Math.abs(bounds.right-card.right)<1;
        });
      });
      expect(tableEdges).toBe(true);
      const edges=await footer.evaluate(element=>{
        const card=element.closest('[data-slot="card"]')!.getBoundingClientRect(),bounds=element.getBoundingClientRect();
        return {left:Math.abs(card.left-bounds.left),right:Math.abs(card.right-bounds.right),bottom:Math.abs(card.bottom-bounds.bottom)};
      });
      expect(edges.left).toBeLessThan(1);
      expect(edges.right).toBeLessThan(1);
      expect(edges.bottom).toBeLessThan(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await footer.screenshot({path:`test-results/pagination-${width}-${theme}.png`});
    }
  }
  await expect(page.getByText('Страница 1 из 3',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Предыдущая страница',exact:true})).toBeDisabled();
  delayNext=true;
  await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await expect(page.getByRole('button',{name:'Следующая страница',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Предыдущая страница',exact:true})).toBeDisabled();
  await expect(page.getByRole('link',{name:'Предприятие 1',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Предприятие 26',exact:true})).toBeVisible();
  expect(requests.at(-1)).toMatchObject({limit:25,offset:25});
  await page.getByRole('combobox',{name:'Количество предприятий на странице'}).click();
  await page.getByRole('option',{name:'10',exact:true}).click();
  await expect(page.getByText('Страница 1 из 7',{exact:true})).toBeVisible();
  expect(requests.at(-1)).toMatchObject({limit:10,offset:0});
  await page.getByRole('combobox',{name:'Количество предприятий на странице'}).click();
  await page.getByRole('option',{name:'50',exact:true}).click();
  await expect(page.getByText('Страница 1 из 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await expect(page.getByRole('link',{name:'Предприятие 51',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Следующая страница',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Состояние',exact:true}).click();
  await page.getByRole('option',{name:'Архив',exact:true}).click();
  await expect(page.getByText('Страница 1 из 2',{exact:true})).toBeVisible();
  expect(requests.at(-1)).toMatchObject({limit:50,offset:0,status:'archived'});
  await page.getByRole('button',{name:'Следующая страница',exact:true}).click();
  await expect(page.getByText('Страница 2 из 2',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Поиск предприятий',exact:true}).fill('Предприятие 1');
  await expect(page.getByText('Страница 1 из 1',{exact:true})).toBeVisible();
  expect(requests.at(-1)).toMatchObject({limit:50,offset:0,search:'Предприятие 1'});
});
