# Локальная разработка и запуск

## Среда

Windows 11, WSL 2 и Docker Desktop 4.93.0 (per-user), Docker Engine 29.8.1, Git 2.55.0, существующий Node.js 24.14.1. Go 1.27.1 установлен в %LOCALAPPDATA%\Neiroot\tools\go; после новой оболочки доступен через пользовательский PATH. После включения VirtualMachinePlatform Windows вручную перезагружена 3 октября; агент компьютер не перезапускал. Основа: [официальная установка Docker](https://docs.docker.com/desktop/setup/install/windows-install/).

## Основной запуск

Из корня клонированного репозитория в PowerShell (предварительные требования — в README):

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
~~~

Временный `-ExecutionPolicy Bypass` действует только в дочернем процессе PowerShell: системная политика не меняется. Скрипт запускает Docker Desktop, если Engine остановлен, ждёт его готовности, создаёт недостающие локальные секреты/сертификат, проверяет Compose, собирает сервисы, ждёт readiness и настраивает профиль Keycloak и scope basic. Затем открыть [Neiroot](https://localhost:8443) и зарегистрировать владельца. Демоаккаунты при основном запуске не создаются.

Первичная подготовка отдельно: .\scripts\setup-local.ps1. mkcert 1.4.4 добавляет локальный CA в доверенные Windows и выпускает localhost/127.0.0.1/::1 сертификат. Скрипт .\scripts\install-prerequisites.ps1 устанавливает Go и компоненты WSL; системное подтверждение и перезагрузка остаются пользователю. Docker Desktop устанавливается отдельно официальным Windows-установщиком; на этой машине уже установлен 4.93.0, подпись Docker Inc проверена. Git и Node.js на машине доступны.

Compose запускает Traefik 3.7.13, nginx/web, BFF, core, Keycloak 26.8.0, PostgreSQL 18.6 и одноразовые миграции. Единственный опубликованный порт: 127.0.0.1:8443. PostgreSQL и технические endpoints наружу не опубликованы. Данные — volume neiroot_pgdata, PG18 монтируется в /var/lib/postgresql. Базы auth/core/bff и их роли разделены; owner мигрирует, app не обходит RLS.

Секреты .env, SQL начальных ролей, realm с секретами, ключи, сертификаты, логи находятся в .local и исключены из Git. setup повторно сохраняет существующие значения. Не регенерировать .env при уже инициализированном volume: пароли базы не меняются от правки файла.

Фактический запуск 3 октября: сборки всех Dockerfile завершились, миграции повторно применились без ошибок, сервисы прошли health/readiness. В `web` проверка обращается к `127.0.0.1`, поскольку nginx слушает IPv4, а `localhost` в образе разрешается прежде всего в IPv6. В Chrome проверены гостевая сессия и форма регистрации; основная база не заполнена тестовыми пространствами.

При восстановлении локальной среды обнаружена отсутствующая запись `HKCU\SOFTWARE\Docker Inc.\Docker Desktop`: добавлен только `InstallPath` со значением существующей установки `%LOCALAPPDATA%\Programs\DockerDesktop`. Повторный запуск подписанного установщика того же релиза завершился кодом 3 («уже актуальная установка»), данные не удалялись. Временная задача без расписания, использованная для диагностики запуска, удалена.

Из-за DNS-ошибок Docker Hub образ nginx был скачан через [Google mirror](https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images) с **тем же** digest из image-lock и помечен исходным локальным тегом. Dockerfile и закреплённые хеши не менялись. Настройки VPN/DNS Windows не менялись. При повторении подобного сбоя сначала проверить доступность реестра; не сбрасывать Docker или volumes ради повторной загрузки.

~~~powershell
docker compose ps
docker compose logs --tail 100 core bff
docker compose stop
docker compose up -d --wait
~~~

Обычная остановка/перезапуск не удаляют volume. down -v не является командой запуска. Миграции goose встроены в бинарники, версии сохраняются; повторный запуск безопасен. После изменения темы/realm использовать start-local; импорт realm не перезаписывает существующие аккаунты. Профиль обновляет configure-keycloak.ps1. Более глубокие изменения realm требуют отдельной миграции конфигурации.

## Исходники и проверки

Единый источник визуальных значений — `docs/design/tokens.css`. `node scripts/sync-design.cjs` синхронизирует токены React, общедоступный CSS и тему Keycloak; основной start-local вызывает его перед Compose. При ручной сборке после изменения токенов сначала выполнить синхронизацию. Собственные ресурсы темы сейчас используют версию `20261005-3`.

После обновления темы Compose отключает кеш шаблонов и статических ресурсов Keycloak в локальной среде. Это предотвращает смешение новой формы со старым CSS/JS. Изменение команды контейнера применяется через `docker compose up -d --wait keycloak`, исходный realm и аккаунты сохраняются.

Браузер может сохранять старые ресурсы, загруженные до отключения кеша. Для собственных CSS/JS темы и PNG используется параметр версии в URL; при изменении этих ресурсов повышать его в `theme.properties` и компоненте Brand. Отключение серверного кеша само по себе не очищает браузерный кеш.

Проверка двух шагов, реальной регистрации и входа по телефону/email: из `apps/web`, с `NODE_OPTIONS=--use-system-ca` и `NEIROOT_INTEGRATION=1`, выполнить `npx playwright test --project=integration auth-theme.spec.ts`. Синтетические аккаунты этих тестов удаляются в finally; пространства не создаются.

~~~powershell
go test ./...
go vet ./...
.\scripts\generate-contracts.ps1
npm ci --prefix tools/contracts
npm ci --prefix apps/web
npm run generate:api --prefix apps/web
npm run typecheck --prefix apps/web
npm run build --prefix apps/web
Push-Location apps/web
npx playwright test --project=visual
Pop-Location
~~~

Для Go в текущей оболочке можно использовать & "$env:LOCALAPPDATA/Neiroot/tools/go/bin/go.exe". Визуальные тесты запускают Vite сами и используют только синтетические API-фикстуры. Для интеграционных тестов сначала запустить реальный стек:

~~~powershell
$env:NODE_OPTIONS='--use-system-ca'
$env:NEIROOT_INTEGRATION='1'
Push-Location apps/web
npx playwright test --project=integration
Pop-Location
~~~

Chrome установлен локально и используется Playwright. Проверка TLS не отключается: Node использует доверенный CA Windows. Прямой core health в тестах выбирается через NEIROOT_TEST_CORE_URL только для изолированной нативной среды; в Compose проверять core внутри сети.

Реальный SQL-тест запускается с NEIROOT_TEST_DATABASE_URL на отдельной базе тестов под core_app, с применёнными миграциями. Не направлять его в базу реальных клиентов: он сохраняет синтетические пространства.

## Дополнительная нативная тестовая среда

Чтобы проверить PostgreSQL/Keycloak до запуска Docker, подготовлены install-test-runtime.ps1 -Component java|postgres|keycloak|traefik, start-test-runtime.ps1 и stop-test-runtime.ps1. Установка использует Temurin 25.0.4.1+1, PostgreSQL 18.6, Keycloak 26.8.0 и Traefik 3.7.13 с локальной фиксацией хешей. Это тестовая альтернатива, основной запуск остаётся Compose. Все подключения loopback, cache Keycloak local, адрес тот же https://localhost:8443; нативную среду остановить перед Compose. Данные в .local/native-tests/pgdata сохраняются для проверки повторного запуска.

Компоненты на этой машине уже установлены. Полный повтор интеграционных проверок в нативной среде:

~~~powershell
.\scripts\setup-local.ps1
npm ci --prefix apps/web
npm run build --prefix apps/web
.\scripts\start-test-runtime.ps1
$env:NODE_OPTIONS='--use-system-ca'
$env:NEIROOT_INTEGRATION='1'
$env:NEIROOT_TEST_CORE_URL='http://127.0.0.1:28001'
$env:NEIROOT_NATIVE_FAULT_TEST='1'
Push-Location apps/web
npx playwright test --project=integration
Pop-Location
~~~

`NEIROOT_NATIVE_FAULT_TEST=1` разрешает тесту останавливать и запускать только управляемую нативную среду, проверяя восстановление после отказа Keycloak и сохранение данных. Не задавать этот флаг для Compose. Тест перезапускает PostgreSQL: SQL-проверку выполнять **после** завершения Playwright, а не параллельно.

~~~powershell
$taskConfig = @{}
foreach ($taskLine in Get-Content -LiteralPath '.env') {
    if ($taskLine -match '^([A-Z_]+)=(.+)$') { $taskConfig[$Matches[1]] = $Matches[2] }
}
$env:NEIROOT_TEST_DATABASE_URL = 'postgres://core_app:' + $taskConfig.CORE_APP_PASSWORD + '@127.0.0.1:25432/core?sslmode=disable'
& "$env:LOCALAPPDATA/Neiroot/tools/go/bin/go.exe" test -count=1 ./services/core/internal/integration
Remove-Item Env:NEIROOT_TEST_DATABASE_URL
.\scripts\stop-test-runtime.ps1
Remove-Item Env:NEIROOT_INTEGRATION, Env:NEIROOT_TEST_CORE_URL, Env:NEIROOT_NATIVE_FAULT_TEST -ErrorAction SilentlyContinue
~~~

Не выводить строку подключения или содержимое `.env` в терминал/отчёт. Перед изолированными визуальными тестами остановить нативную среду и убрать `NEIROOT_INTEGRATION`, чтобы Playwright сам запустил Vite. После проверки 3 октября нативная среда остановлена; файлы данных сохранены.

## Схемы и зависимости

Версии: go.mod/go.sum, apps/web/package-lock.json, tools/contracts/package-lock.json, tools/diagrams/package-lock.json, Dockerfile/compose. Семь внешних образов закреплены по тегу и digest; источники реестров — [image-lock.json](../infra/image-lock.json). Скрипт `scripts/pin-images.ps1` обновляет digest при намеренном обновлении образов, обычный старт его не вызывает. TypeScript 7 в приложении; генератор openapi-typescript 7.13.0 изолирован на поддерживаемом TS 5.9.3. Лицензии — [dependency-licenses.md](dependency-licenses.md), обновление `node scripts/update-license-inventory.cjs` (переменная `NEIROOT_GO` при необходимости задаёт путь к Go).

~~~powershell
npm ci --prefix tools/diagrams
node docs/diagrams/render-architecture.cjs tools/diagrams/node_modules
node docs/diagrams/export-architecture-pdf.cjs tools/diagrams/node_modules
~~~

Общая схема включает будущие сервисы: наличие на ней брокера, мониторинга или копий не означает их запуск на первом этапе.

Проверка отдельных имён сотрудников: `node scripts/test-employee-name-migration.cjs` создаёт и удаляет только собственную временную базу в локальном PostgreSQL, проверяя старую запись и RLS. С работающим Compose, `NODE_OPTIONS=--use-system-ca` и `NEIROOT_INTEGRATION=1`, из apps/web выполнить `npx playwright test --project=integration employee-names.spec.ts`. Проверяются реальные формы, отдельные SQL-столбцы, Keycloak и приглашение; синтетическое пространство и аккаунты очищаются в finally. Миграция 00002 выполняется обычным start-local, данные не сбрасываются.
