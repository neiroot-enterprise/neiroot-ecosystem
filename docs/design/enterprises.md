# Предприятия

Навигация «Список предприятий / Отделы» — действующий образец [оформления Tabs](components.md#tabs) и [размещения вкладок](patterns.md#вкладки-подразделов). Реализация — CatalogTabs в [Catalog.tsx](../../apps/web/src/features/company/Catalog.tsx). TabsTrigger рендерит React Router Link, сохраняя URL разделов и открытие ссылки в новой вкладке. Вкладки внутри карточки предприятия пока используют отдельное оформление и не служат образцом нового дизайна.

[Catalog.tsx](../../apps/web/src/features/company/Catalog.tsx) использует общий Table, Badge, Button, Card, Input, Dialog, AlertDialog и ActionsMenu. Локальный [catalog-ui.tsx](../../apps/web/src/features/company/catalog-ui.tsx) использует общие компоненты на маршрутах предприятий и организаций. [catalog.css](../../apps/web/src/features/company/catalog.css) ограничен `.enterprise-ui`; дерево сохраняет отступы, линии связей и горизонтальную прокрутку только своей области. Короткие подтверждения используют AlertDialog с безопасным начальным фокусом, редакторы — Dialog с возвратом фокуса.

[Общий визуальный язык](../../DESIGN.md) · [Каталог компонентов](components.md) · [Критерии приёмки](../quality.md).
