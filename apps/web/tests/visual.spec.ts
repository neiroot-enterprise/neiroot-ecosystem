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
  const profilePlaceholder = page.getByRole("dialog", { name: "Профиль" });
  await expect(profilePlaceholder).toContainText("Раздел в разработке.");
  await profilePlaceholder.getByRole("button", { name: "Закрыть" }).click();
  await expect(profile).toBeFocused();
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
  await mobileProfileMenu.getByRole("menuitem", { name: "Уведомление" }).click();
  const notificationPlaceholder = page.getByRole("dialog", { name: "Уведомление" });
  await expect(notificationPlaceholder).toContainText("Раздел в разработке.");
  await notificationPlaceholder.getByRole("button", { name: "Закрыть" }).click();
  await expect(notificationPlaceholder).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Главное меню" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Открыть меню" }),
  ).toBeFocused();
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
