# Архитектурные схемы

Команды ниже выполняются из корня проекта. Файлы схем находятся в этом каталоге.

[Платформа](../architecture.md) · [Ядро](../core-architecture.md).

## Обновление изображения

После изменения [исходной схемы платформы](architecture.json) запустить:

```powershell
node docs/diagrams/render-architecture.cjs "ПУТЬ_К_NODE_MODULES"
```

Требуются `@viz-js/viz` и `sharp`; воспроизводимые зависимости закреплены в tools/diagrams/package-lock.json. Рендер обновляет DOT, PlantUML, SVG и PNG. Проверяет ошибки компоновки и фиксирует ширину; после изменений необходим визуальный просмотр.

## PDF для просмотра

[PDF платформы](../../output/pdf/neiroot-saas-architecture.pdf) содержит текущую схему v0.7 на одной большой странице. Текст и линии векторные: схему можно увеличивать без потери чёткости. Компоновка и содержимое соответствуют SVG.

После обновления изображения повторно экспортировать PDF:

```powershell
node docs/diagrams/export-architecture-pdf.cjs "ПУТЬ_К_NODE_MODULES"
```

Экспорт использует закреплённый Playwright и доступный Google Chrome.

## Файлы и обновление

- [core-architecture.json](core-architecture.json) — модули, стек, назначения и разделы.
- [core-architecture.dot](core-architecture.dot) — расположение и ортогональные связи.
- [core-architecture.puml](core-architecture.puml) — UML-представление.
- [core-architecture.svg](core-architecture.svg) и [core-architecture.png](core-architecture.png) — схема для просмотра.
- [render-core-architecture.cjs](render-core-architecture.cjs) — воспроизводимый рендер.
- [PDF ядра](../../output/pdf/neiroot-core-architecture.pdf) — отдельный векторный PDF для просмотра с увеличением.

```powershell
node docs/diagrams/render-core-architecture.cjs "ПУТЬ_К_NODE_MODULES"
node docs/diagrams/export-architecture-pdf.cjs "ПУТЬ_К_NODE_MODULES" core-architecture
```

Стиль соответствует общей схеме: тёмный фон, прямоугольные блоки, стереотипы, ширина 330 единиц и соединения с поворотами на 90°.
