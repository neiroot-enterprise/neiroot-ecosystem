# Версии и лицензии

Реестр получен из package-lock.json и установленного Go module cache; полный граф с npm integrity — [dependency-licenses.json](dependency-licenses.json). Обновление: node scripts/update-license-inventory.cjs; NEIROOT_GO задаёт абсолютный путь к Go при необходимости.

## Runtime и инструменты

| Компонент | Версия | Лицензия |
|---|---|---|
| Go | 1.27.1 | BSD-3-Clause |
| Node.js | 24.14.1 | MIT AND bundled third-party notices |
| Keycloak | 26.8.0 | Apache-2.0 |
| PostgreSQL | 18.6 | PostgreSQL |
| Traefik | 3.7.13 | MIT |
| nginx | 1.30.5 | BSD-2-Clause |
| mkcert | 1.4.4 | BSD-3-Clause |
| Docker Desktop | 4.93.0 | Docker Subscription Service Agreement |
| oapi-codegen | 2.8.0 | Apache-2.0 |
| Temurin test JDK | 25.0.4.1+1 | GPL-2.0-only WITH Classpath-exception-2.0 |

Ссылки на первичные лицензии сохранены в JSON. Контейнерные ОС сохраняют собственные bundled notices: Debian bookworm, Alpine 3.23.4, UBI в Keycloak. Исходный логотип и референсы предоставлены пользователем, их лицензия не переносится на третьих лиц. Docker Desktop имеет собственные условия подписки; это отдельный продукт от open-source Engine.

## Go-модули

| Модуль | Версия | Лицензия |
|---|---|---|
| github.com/apapsch/go-jsonmerge/v2 | v2.0.0 | MIT |
| github.com/google/uuid | v1.6.0 | BSD-3-Clause |
| github.com/oapi-codegen/runtime | v1.7.0 | Apache-2.0 |
| github.com/go-chi/chi/v5 | v5.3.2 | MIT |
| github.com/go-jose/go-jose/v4 | v4.1.4 | Apache-2.0 |
| golang.org/x/oauth2 | v0.36.0 | BSD-3-Clause |
| github.com/coreos/go-oidc/v3 | v3.21.0 | Apache-2.0 |
| github.com/jackc/pgx/v5 | v5.11.0 | MIT |
| github.com/jackc/pgpassfile | v1.0.0 | MIT |
| github.com/jackc/pgservicefile | v0.0.0-20240606120523-5a60cdf6a761 | MIT |
| golang.org/x/text | v0.41.0 | BSD-3-Clause |
| github.com/jackc/puddle/v2 | v2.2.2 | MIT |
| golang.org/x/sync | v0.22.0 | BSD-3-Clause |
| github.com/pressly/goose/v3 | v3.28.0 | MIT |
| github.com/mfridman/interpolate | v0.0.2 | MIT |
| go.uber.org/multierr | v1.11.0 | MIT |
| github.com/sethvargo/go-retry | v0.4.0 | Apache-2.0 |

## Прямые npm-зависимости

| Пакет | Версия | Лицензия |
|---|---|---|
| @hookform/resolvers | 5.9.1 | MIT |
| @playwright/test | 1.63.0 | Apache-2.0 |
| @tanstack/react-query | 5.104.1 | MIT |
| @types/node | 24.19.1 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @vitejs/plugin-react | 6.1.1 | MIT |
| lucide-react | 1.50.0 | ISC |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-hook-form | 7.89.0 | MIT |
| react-router-dom | 7.18.4 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| vite | 8.3.2 | MIT |
| zod | 4.6.5 | MIT |
| openapi-typescript | 7.13.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| @viz-js/viz | 3.25.0 | MIT |
| playwright | 1.62.1 | Apache-2.0 |
| sharp | 0.35.4 | Apache-2.0 |

Все npm-транзитивные пакеты включены в JSON. Лицензии BSD/MIT/Apache допускают использование при сохранении соответствующих уведомлений. При распространении артефактов сохранять LICENSE/NOTICE зависимостей и runtime; локальный реестр не заменяет их текстов.
