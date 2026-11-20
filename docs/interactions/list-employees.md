# Получение списка сотрудников

Действующая операция `listEmployees` — `GET /api/v1/tenants/{tenantId}/employees`. Владелец данных и прикладной операции — [company](../services/core/modules/company/index.md) в Core. Потребитель — список сотрудников в web. Сетевой посредник — [BFF](../services/bff/index.md).

1. [Экран сотрудников](../../apps/web/src/features/company/Employees.tsx) через [HTTP-клиент](../../apps/web/src/shared/api/client.ts) передаёт идентификатор экосистемы, поиск, limit и offset.
2. [BFF](../../services/bff/main.go) применяет серверную сессию и проксирует запрос в Core. [Маршрутизатор ядра](../../services/core/main.go) передаёт его в [HTTP-адаптер company](../../services/core/internal/modules/company/adapters/inbound/http.go), где разбирается пагинация.
3. [Сценарий List](../../services/core/internal/modules/company/application/company.go) открывает транзакцию с tenant, проверяет доступ через порт [settings](../services/core/modules/settings/index.md), читает строки и общее количество через [репозиторий](../../services/core/internal/modules/company/adapters/outbound/postgres.go) и получает сведения о доступе сотрудников.
4. Результат или ошибка возвращается в web. Ошибку параметров или доступа обрабатывают до выдачи записей. При изменении ответа сверяют права и ошибки, модели Go и TypeScript и отображение результата при поиске и пагинации.

[Точный HTTP-контракт](../api/openapi.json) · [Типы и ошибки](../api-contracts.md) · [Правила доступа](../access-model.md) · [Интеграционные сценарии](../../apps/web/tests/integration.spec.ts) · [Статус приёмки](../test-report.md).
