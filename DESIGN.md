---
name: Neiroot
version: alpha
description: Визуальный язык веб-приложения Neiroot
colors:
  primary: "#2f7d4a"
  primary-text: "#ffffff"
  background: "#f6f7f8"
  foreground: "#171a1f"
  surface: "#ffffff"
  muted-text: "#66706a"
  border: "#e1e5e9"
  accent: "#e8f4ec"
  destructive: "#b42318"
  dark-primary: "#65b77e"
  dark-primary-text: "#0d2013"
  dark-background: "#111512"
  dark-foreground: "#f3f5f3"
  dark-surface: "#171c18"
  dark-muted-text: "#aab4ad"
  dark-border: "#2b332d"
  dark-accent: "#20382a"
  dark-destructive: "#f07167"
typography:
  page:
    fontFamily: Onest Variable
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 2rem
  page-desktop:
    fontFamily: Onest Variable
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 2.25rem
  section:
    fontFamily: Onest Variable
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.375rem
  dialog-title:
    fontFamily: Onest Variable
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5rem
  body:
    fontFamily: Onest Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  label:
    fontFamily: Onest Variable
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25rem
  input-compact:
    fontFamily: Onest Variable
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25rem
  caption:
    fontFamily: Onest Variable
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1rem
rounded:
  base: 0.625rem
spacing:
  tight: 0.5rem
  block: 1rem
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-primary-text}"
---
## Overview

Neiroot — рабочее приложение для управления бизнесом. Заголовки помогают понять, какие данные открыты, интервалы объединяют связанные элементы, а цвет выделяет доступные действия и текущий выбор. В оболочке используется прозрачная фирменная надпись NEIROOT с вариантом для тёмного фона. Использовать нижнюю надпись исходного логотипа без большого знака бесконечности над ней, полный исходник сохранять.

## Colors

Светлая тема используется по умолчанию. Обе темы используют одинаковые смысловые роли. Для фона страницы брать background, для поверхности — card, для текста — foreground, для второстепенной подписи — muted-foreground. Основное действие использует пару primary и primary-foreground. Выбранный пункт использует accent и accent-foreground. Ошибка или опасное действие использует destructive вместе с понятной подписью или значком. Полные значения обеих тем определены в [theme.css](apps/web/src/shared/styles/theme.css). В YAML имена primary-text, surface и muted-text соответствуют CSS-переменным primary-foreground, card и muted-foreground. Префикс dark- обозначает значения тех же ролей внутри .dark. При реализации использовать существующие переменные CSS и их Tailwind-привязки.

## Typography

Основной шрифт — Onest Variable, загружается локально. Токены описывают существующие роли в интерфейсе при корневом размере 16 px. Конкретный компонент выбирает роль и может иметь явно описанное локальное исключение.

| Роль | Размер / строка | Вес | Применение в коде |
|---|---|---|---|
| page | 24 / 32 px | 600 | Заголовок страницы text-2xl |
| page-desktop | 30 / 36 px | 600 | Заголовок от md, md:text-3xl |
| section | 16 / 22 px | 500 | CardTitle в Card size=default, text-base leading-snug |
| dialog-title | 16 / 24 px | 500 | Заголовок окна с leading-6 |
| body | 14 / 20 px | 400 | Текст плотных рабочих блоков, text-sm |
| label | 14 / 20 px | 500 | Подпись управления, text-sm font-medium |
| input-compact | 14 / 20 px | 500 | Значение компактного поля |
| caption | 12 / 16 px | 400 | Короткие второстепенные сведения, text-xs |

Подпись поля может использовать обычный вес и muted-foreground, если так оформлена выбранная форма. Базовый Input имеет текст 16 / 24 px до md и 14 / 20 px от md, плотный вариант задаётся классами формы. Корневой body сохраняет размер по умолчанию, роль body применяется к рабочим блокам через text-sm. Для сравнения чисел используется font-variant-numeric: tabular-nums. Локальные исключения шрифта описываются у соответствующего экрана.

## Layout

Близость элементов показывает их связь. Интервал tight подходит для тесно связанных элементов управления, block — для внутреннего отступа группы. Состав и расположение групп определяет задача экрана. На узком экране сохранять порядок чтения и доступ к действиям. Размещение общей навигации описано в [app-shell.md](docs/design/app-shell.md).

## Elevation & Depth

Фон поверхности, тонкая рамка и свободное пространство отделяют группы данных друг от друга. Для меню, подсказок и диалогов использовать слои и тени соответствующих общих компонентов. При анимации учитывать системную настройку уменьшения движения.

## Shapes

Базовый радиус темы — 0.625rem. Производные радиусы sm, md, lg и xl определены в apps/web/src/shared/styles/globals.css. Поля, кнопки и карточки получают скругление из выбранного компонента. Для иконок действий использовать Lucide.

## Components

При конфликте нового оформления из этого документа и docs/design/ с legacy-реализацией использовать новое оформление. Старый экран не служит основанием сохранять прежние размеры и раскладку.

Обязательно переиспользовать подходящий компонент и его доступные варианты. Выбор зависит от действия пользователя и требуемых состояний. Найти реализацию можно в [каталоге компонентов](docs/design/components.md), а способы сочетать компоненты — в [правилах построения интерфейса](docs/design/patterns.md).

Для вкладок подразделов согласованный образец — «Предприятия → Список предприятий / Отделы». При дальнейшей разработке применять [компонент Tabs](docs/design/components.md#tabs) и [паттерн размещения](docs/design/patterns.md#вкладки-подразделов).

Для самостоятельного списка выбрать [вариант шапки](docs/design/patterns.md#шапка-и-границы-карточки-списка). «Сотрудники» показывают компактную карточку с поиском по команде. «Предприятия» и «Организации» служат образцами компактной карточки с заголовком, счётчиком, поиском и фильтром. Точные размеры и типографика приведены в [каталоге компонентов](docs/design/components.md#компактная-шапка-списка).

## Do's and Don'ts

Использовать семантические переменные, чтобы элемент сохранял свою роль при смене темы. У кнопки с одной иконкой должно быть доступное имя, у интерактивного элемента — видимый фокус. Проверять основной сценарий в обеих темах, с клавиатуры и на узком экране.

## Поддержание токенов

Этот документ фиксирует согласованные правила, theme.css содержит применяемые браузером значения, а [globals.css](apps/web/src/shared/styles/globals.css) связывает их с Tailwind. При согласованном изменении цвета, радиуса или типографики обновить соответствующий источник реализации и описание в этом документе в рамках одной задачи. Сверить точные значения, смысловые пары и обе темы, затем выполнить проверки по [quality.md](docs/quality.md). Автоматического преобразования DESIGN.md в тему приложения сейчас нет.

Существующий [tokens.css](docs/design/tokens.css) и его копии используются прежними ресурсами, включая тему Keycloak. Порядок их обновления через sync-design.cjs описан в [development.md](docs/development.md#общие-ресурсы-интерфейса). Для оформления входа использовать правила формы Keycloak. [Страница входа](docs/design/components.md#страница-входа).
