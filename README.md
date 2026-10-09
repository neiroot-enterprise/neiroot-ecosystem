# Neiroot Enterprise

Мультитенантная SaaS-платформа для бизнесов.

**Состояние первого этапа:** реализованы web, Go BFF/ядро, вход через Keycloak, пространства и сотрудники. Остальные согласованные разделы обозначены «В разработке». Результаты функциональных проверок и оставшаяся приёмка — [test-report.md](docs/test-report.md).

## Разделение общих и персональных файлов

В Git хранятся исходники, переносимые контейнерные конфигурации и шаблоны без секретов. Скрипты конкретной ОС, команды для машины и её журналы ведутся только в игнорируемой рабочей области. Правила подготовки новой машины — [AGENTS.md](AGENTS.md); Windows-автоматизация не входит в состав клона. Переносимость контейнерных конфигураций не означает, что автоматизация для macOS уже реализована или проверена.

## С чего начать

Агент читает [AGENTS.md](AGENTS.md), затем [задание для передачи](docs/implementation-handoff.md). Пользовательские ответы и незакрытые решения находятся в [open-questions.md](docs/open-questions.md).

## Карта документов

| Документ | Для чего служит |
|---|---|
| [AGENTS.md](AGENTS.md) | Правила работы агента и обязательный порядок чтения |
| [PROJECT_MEMORY.md](PROJECT_MEMORY.md) | Фактическое состояние, история и контекст |
| [mvp.md](docs/mvp.md) | Границы первого этапа и степень готовности |
| [requirements.md](docs/requirements.md) | Подтверждённые сценарии, что ещё нужно уточнить |
| [access-model.md](docs/access-model.md) | Tenant, пользователи, вход и разрешения |
| [api-contracts.md](docs/api-contracts.md) | OpenAPI, генерация и поведение API |
| [frontend.md](docs/frontend.md) | Правила React/TypeScript и структура интерфейса |
| [backend.md](docs/backend.md) | Правила Go, модулей и хранения данных |
| [development.md](docs/development.md) | Общие инструменты разработки и проверки |
| [quality.md](docs/quality.md) | Критерии сдачи и необходимые проверки |
| [implementation-plan.md](docs/implementation-plan.md) | Порядок утверждённого первого этапа |
| [implementation-handoff.md](docs/implementation-handoff.md) | Контекст реализации и оставшейся приёмки |
| [open-questions.md](docs/open-questions.md) | Вопросы с постоянными идентификаторами |
| [decisions.md](docs/decisions.md) | Подтверждённые решения и предложения |
| [architecture.md](docs/architecture.md) | Архитектура всей платформы |
| [core-architecture.md](docs/core-architecture.md) | Модули и разделы ядра |
| [design-guidelines.md](docs/design-guidelines.md) | Внешний вид, поведение и UI-компоненты |

## Готовые материалы

- [Общая UML-схема](docs/diagrams/architecture.svg) и [схема ядра](docs/diagrams/core-architecture.svg).
- [PDF платформы](output/pdf/neiroot-saas-architecture.pdf) и [PDF ядра](output/pdf/neiroot-core-architecture.pdf).
- [Дизайн-токены](docs/design/tokens.css), [референсы](docs/design/references/) и [исходный логотип](docs/design/brand/neiroot-logo-source.png).
- [Прозрачная надпись NEIROOT](docs/design/brand/neiroot-wordmark.png) для страниц входа и шапки приложения.

## Правило источников

Функциональность — `requirements.md` и `core-architecture.md`; первый этап — `mvp.md`; архитектура — соответствующие схемы и тексты; доступ — `access-model.md`; внешний вид — `design-guidelines.md`; точный HTTP-контракт после согласования — OpenAPI, см. `api-contracts.md`.

Не копировать одинаковые определения в разные документы. При изменении решения обновлять его источник и связанные ссылки. Если документы противоречат друг другу, сопоставить их с актуальными указаниями пользователя и исправить противоречие.
