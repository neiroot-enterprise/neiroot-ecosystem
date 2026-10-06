# Neiroot Enterprise

Мультитенантная SaaS-платформа для бизнесов. Рабочая папка исторически называется `Neiroot Enerprise v1`; изменение её имени не требуется.

**Состояние на 6 октября 2026 года:** проект запущен в Docker Compose на [https://localhost:8443](https://localhost:8443). Работают web, Go BFF/ядро, Keycloak и PostgreSQL; миграции выполнены. Go и браузерные сценарии ранее проверены с настоящими PostgreSQL и Keycloak, контейнерные сборки и страница регистрации также проверены. Результаты и оставшиеся пункты приёмки — [test-report.md](docs/test-report.md).

## Локальный запуск

Поддерживаемый основной запуск — Windows 11 x64, PowerShell 5.1+, Docker Desktop с Linux containers / WSL 2, Git и Node.js 24.14.1 в PATH. Go и PostgreSQL на компьютере для запуска не нужны: они работают в контейнерах. Нужен доступ к интернету для загрузки образов, npm/Go-зависимостей и mkcert; порт 8443 должен быть свободен.

1. Установить [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/en/download) и [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/). Включить WSL 2 по инструкции Docker; если Windows требует перезагрузку, выполнить её вручную.
2. Клонировать репозиторий по адресу из кнопки **Code** в GitHub (`git clone git@github.com:neiroot-enterprise/project.git`) и перейти в его корневую папку.
3. Выполнить в PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Скрипт запускает Docker Desktop, создаёт локальный `.env` со случайными секретами, сертификат HTTPS и начальные настройки баз, собирает контейнеры, применяет миграции и настраивает Keycloak. При первом выпуске сертификата mkcert может запросить подтверждение установки локального центра сертификации. Не копировать чужой `.env`: у каждого сотрудника своя локальная среда. Описание переменных — [.env.example](.env.example); вручную заполнять их для обычного запуска не требуется.

Открыть [Neiroot](https://localhost:8443), зарегистрироваться и назвать пространство. Вход, пространства и сотрудники реализованы; остальные разделы первого этапа явно обозначены «В разработке». Демоаккаунты автоматически не создаются.

```powershell
docker compose ps
docker compose stop
# Повторный запуск — той же командой start-local.ps1 выше.
```

Данные хранятся в Docker volume `neiroot_pgdata` и сохраняются при остановке и повторном старте. Сохранять `.env` вместе с данными: изменение паролей в файле не меняет пароли уже созданных баз. `docker compose down -v` удаляет локальные данные и не нужен для обычного запуска. `.env`, `.local/` и ключи исключены из Git.

Если запуск не завершился, проверить `docker compose ps` и `docker compose logs --tail 100 core bff keycloak`; не публиковать логи с секретами. При занятом 8443 остановить другое локальное приложение; при ошибке загрузки образа проверить доступ к реестру. Детальные команды, тесты и диагностика — [development.md](docs/development.md). Автоматический запуск на Linux/macOS пока не подготовлен.

## С чего начать

Агент читает [AGENTS.md](AGENTS.md), затем [задание для передачи](docs/implementation-handoff.md). Пользовательские ответы и незакрытые решения находятся в [open-questions.md](docs/open-questions.md).

## Карта документов

| Документ | Для чего служит |
|---|---|
| [AGENTS.md](AGENTS.md) | Правила работы агента и обязательный порядок чтения |
| [Agent.md](Agent.md) | Фактическое состояние, история и контекст |
| [mvp.md](docs/mvp.md) | Границы первого этапа и степень готовности |
| [requirements.md](docs/requirements.md) | Подтверждённые сценарии, что ещё нужно уточнить |
| [access-model.md](docs/access-model.md) | Tenant, пользователи, вход и разрешения |
| [api-contracts.md](docs/api-contracts.md) | OpenAPI, генерация и поведение API |
| [frontend.md](docs/frontend.md) | Правила React/TypeScript и структура интерфейса |
| [backend.md](docs/backend.md) | Правила Go, модулей и хранения данных |
| [development.md](docs/development.md) | Организация исходников, среда и запуск |
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
