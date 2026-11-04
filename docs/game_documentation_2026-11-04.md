# 2Box Puzzle — Полная документация игры

**Дата составления:** 4 ноября 2026  
**Репозиторий:** https://bitbucket.org/reTTT/2boxpuzzle.git  
**Движок:** Godot Engine 4.3 (Mobile, GL Compatibility)  
**Жанр:** Головоломка (Sokoban-подобная)  
**Платформы:** Мобильные (Android/iOS), ПК  
**Разработчики:**
- Программист: Alexey Dyadchenko
- Художник: Olga Iva
- Дизайнер уровней: Nikolay Unknow

---

## 1. Описание игры

**2Box** — головоломка в 3D-представлении, в которой игрок управляет двумя кубиками разных цветов (красный и жёлтый) на поле с сеткой. Цель уровня — переместить оба кубика на соответствующие по цвету целевые площадки.

Игровое поле представлено в изометрической 3D-проекции с фиксированной камерой. Все элементы (стены, пол, кубики, целевые точки) отрисованы простыми геометрическими примитивами с цветными материалами.

---

## 2. Ключевые файлы проекта

| Путь | Назначение |
|------|-----------|
| [`project.godot`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/project.godot) | Конфигурация проекта Godot |
| [`scn/game.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/scn/game.tscn) | Главная (и единственная) сцена игры |
| [`script/game/game.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/game.gd) | Главный контроллер игрового процесса |
| [`script/game/field.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/field.gd) | Построение/удаление уровня из данных |
| [`script/game/grid.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/grid.gd) | Визуализация сетки поля |
| [`script/FSM/fsm.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/FSM/fsm.gd) | Конечный автомат состояний |
| [`script/FSM/fsm_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/FSM/fsm_state.gd) | Базовый класс состояния |
| [`script/game/entiny/entity.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/entiny/entity.gd) | Базовый класс сущности (Entity) |
| [`script/game/entiny/box.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/entiny/box.gd) | Класс кубика (Box) |
| [`script/game/entiny/end_point.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/entiny/end_point.gd) | Класс целевой точки (EndPoint) |
| [`script/game/levels/level.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/level.gd) | Структура данных уровня |
| [`script/game/levels/episode.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/episode.gd) | Эпизод (набор уровней) |
| [`script/game/levels/episode_mng.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/episode_mng.gd) | Автозагрузка: менеджер эпизодов |
| [`db/episode_1.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/db/episode_1.gd) | Данные уровней эпизода 1 |
| [`db/episode_2.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/db/episode_2.gd) | Данные уровней эпизода 2 |
| [`script/game/input/input_key.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_key.gd) | Ввод с клавиатуры |
| [`script/game/input/input_touch.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_touch.gd) | Ввод свайпами (тач) |
| [`script/game/input/input_demo.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_demo.gd) | Демо-режим (автоигра) |
| [`script/game/state/create_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/create_state.gd) | Состояние: создание/анимация появления уровня |
| [`script/game/state/input_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/input_state.gd) | Состояние: ожидание ввода |
| [`script/game/state/move_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/move_state.gd) | Состояние: анимация движения кубиков |
| [`script/game/state/check_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/check_state.gd) | Состояние: проверка условия победы |
| [`script/game/state/lvl_completed_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/lvl_completed_state.gd) | Состояние: уровень пройден |
| [`script/menu/mmenu.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/menu/mmenu.gd) | Главное меню |
| [`script/lvl_selector/lvl_selector.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/lvl_selector/lvl_selector.gd) | Экран выбора уровня |
| [`script/game/dlg/dlg_mng.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/dlg/dlg_mng.gd) | Менеджер диалогов |
| [`script/game/dlg/gmenu.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/dlg/gmenu.gd) | Диалог паузы |
| [`script/game/dlg/lvl_completed.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/dlg/lvl_completed.gd) | Диалог завершения уровня |
| [`script/global/config.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/config.gd) | Автозагрузка: конфигурация |
| [`script/global/save.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/save.gd) | Автозагрузка: сохранения |
| [`script/statistics/statistics.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/statistics/statistics.gd) | Автозагрузка: статистика (ход, таймер) |
| [`script/gui_3d.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/gui_3d.gd) | Мост 3D→2D для UI через SubViewport |
| [`loc/puzzle_game.csv`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/loc/puzzle_game.csv) | Локализация (EN/RU) |

---

## 3. Архитектура

### 3.1 Конечные автоматы (FSM)

В игре используются **два** конечных автомата:

#### Меню FSM (`menuFSM`)
Управляет глобальным состоянием приложения.

| Состояние | Описание |
|-----------|----------|
| `mmenu` | Главное меню (стартовое) |
| `selector` | Экран выбора уровня |
| `game` | Игровой процесс |
| `help` | Экран помощи |
| `about` | Экран «О игре» |

**Файл:** [`script/menu/states/`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/menu/states/)

#### Игровой FSM (`gameFSM`)
Управляет циклом игрового уровня.

| Состояние | Описание |
|-----------|----------|
| `create` | Анимация появления уровня (волна от случайных точек) |
| `input` | Ожидание действия игрока |
| `move` | Анимация скольжения кубиков |
| `check` | Проверка условия завершения уровня |
| `completed` | Уровень пройден |
| `start` | Зарезервировано (пустое) |

**Файл:** [`script/game/state/`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/)

### 3.2 Автозагрузки (Autoload)

| Имя | Скрипт | Назначение |
|-----|--------|-----------|
| `Config` | [`script/global/config.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/config.gd) | Хранилище настроек с автосохранением |
| `Save` | [`script/global/save.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/save.gd) | Система сохранений |
| `EpisodeMng` | [`script/game/levels/episode_mng.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/episode_mng.gd) | Управление эпизодами/уровнями |
| `Statistics` | [`script/statistics/statistics.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/statistics/statistics.gd) | Таймер и счётчик ходов |

---

## 4. Игровые механики

### 4.1 Типы клеток (`Level.CellType`)

| Значение | Имя | Описание |
|----------|-----|----------|
| -1 | `UNKNOWN` | Пустое пространство за пределами поля (не рендерится) |
| 0 | `EMPTY` | Свободная клетка (рендерится пол) |
| 1 | `WALL` | Стена (непроходимый блок) |
| 2 | `BOX` | Кубик цвета ONE (красный) |
| 3 | `END` | Целевая площадка цвета ONE (красная) |
| 4 | *(BOX, TWO)* | Кубик цвета TWO (жёлтый) |
| 5 | *(END, TWO)* | Целевая площадка цвета TWO (жёлтая) |

**Файл:** [`script/game/levels/level.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/level.gd)

### 4.2 Цвета (`Level.ColorType`)

| Значение | Имя | Материал | Цвет (RGB) |
|----------|-----|----------|------------|
| 0 | `ONE` | [`res/mat_color_one.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_color_one.tres) | Красный `(0.92, 0.12, 0.11)` |
| 1 | `TWO` | [`res/mat_color_two.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_color_two.tres) | Жёлтый `(0.75, 0.71, 0.11)` |

### 4.3 Условие победы

Уровень считается пройденным, когда **каждая** целевая площадка (`END`) содержит на себе кубик (`BOX`) **того же цвета**.

**Файл:** [`script/game/state/check_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/check_state.gd) — метод `_is_completed()`

### 4.4 Механика движения кубиков

**Ключевая особенность:** При каждом нажатии направления (или свайпе) **все кубики** на поле одновременно пытаются сдвинуться в указанном направлении. Каждый кубик скользит до упора (до стены, края поля или другого кубика).

Алгоритм (`move_state.gd`):
1. Для каждого кубика вычисляется расстояние скольжения (`_get_len_path`):
   - Кубик может скользить по свободным клеткам (`EMPTY`, `END`)
   - Стены (`WALL`) и неизвестные клетки (`UNKNOWN`) блокируют движение
   - Другие кубики блокируют движение (учитываются через `Util.create_lvl`)
2. Если хотя бы один кубик может двигаться — запускается анимация (Tween)
3. Все кубики двигаются параллельно с easing `EASE_OUT` / `TRANS_CIRC`
4. После завершения анимации — переход в состояние `check`

**Файл:** [`script/game/state/move_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/move_state.gd)

### 4.5 Анимация появления уровня

При создании уровня объекты появляются волнами от 1–3 случайных точек (BFS-распространение). Каждая волна появляется каждые 0.025 секунды.

**Файл:** [`script/game/state/create_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/create_state.gd)

### 4.6 Демо-режим

При нахождении в меню (не в состоянии `game`) включается демо-режим: кубики двигаются автоматически случайными направлениями с задержкой 0.5–2.0 сек. Вероятность направления корректируется (выбранное направление снижает шанс на 0.2, остальные повышают на 0.2).

**Файл:** [`script/game/input/input_demo.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_demo.gd)

---

## 5. Управление

### 5.1 Клавиатура (ПК)

| Действие | Клавиша |
|----------|---------|
| Вверх | Стрелка ↑ (`ui_up`) |
| Вниз | Стрелка ↓ (`ui_down`) |
| Влево | Стрелка ← (`ui_left`) |
| Вправо | Стрелка → (`ui_right`) |
| Рестарт уровня | `R` (`ui_reset`) |

**Файл:** [`script/game/input/input_key.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_key.gd)

### 5.2 Тач (мобильные)

Свайп в любом из 4 направлений. Направление определяется по преобладающей оси (X или Y).

**Файл:** [`script/game/input/input_touch.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/input/input_touch.gd)

---

## 6. Навигация по меню и экранам

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MENU FSM (menuFSM)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    Play     ┌──────────────┐   Select Lvl  ┌──────┐  │
│  │  mmenu   │────────────▶│  selector    │──────────────▶│ game │  │
│  │(Главное  │◀────────────│(Выбор уровня)│               │      │  │
│  │  меню)   │    Back     └──────────────┘               └──┬───┘  │
│  │          │                                               │      │
│  │ - Resume │                        Reset (R) ────────────┘      │
│  │ - Play   │                                                     │
│  │ - Help   │           ┌─────────────────────────────┐           │
│  │ - About  │           │        In-Game Dialogs        │           │
│  └──────────┘           │                             │           │
│       ▲ ▲               │  gmenu (Pause):             │           │
│       │ │               │    Resume → game            │           │
│       │ │               │    Level select → selector  │           │
│       │ │               │    Main Menu → mmenu        │           │
│       │ │               │                             │           │
│       │ │               │  lvl_completed:             │           │
│       │ │               │    Next → game (next lvl)   │           │
│       │ │               │    Home → mmenu             │           │
│       │ │               │    Reset → game (same lvl)  │           │
│       │ │               └─────────────────────────────┘           │
│       │ │                                                         │
│       │ └──────────── Help ◀── Help button                        │
│       │                  Back → mmenu                              │
│       │                                                           │
│       └──────────── About ◀── About button                        │
│                        Back → mmenu                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.1 Главное меню (mmenu)

**Файлы:**
- [`script/menu/mmenu.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/menu/mmenu.gd)
- [`prefab/ui/ui_mmenu.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/ui/ui_mmenu.tscn)

**Кнопки:**
| Кнопка | Переход | Условие |
|--------|---------|---------|
| Resume (Продолжить) | `game` | Активна если есть сохранение |
| Play (Играть) | `selector` | Всегда |
| Options (Настройки) | — | Скрыта/отключена |
| Help (Помощь) | `help` | Всегда |
| About (О игре) | `about` | Скрыта/отключена |

### 6.2 Экран выбора уровня (selector)

**Файлы:**
- [`script/lvl_selector/lvl_selector.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/lvl_selector/lvl_selector.gd)
- [`prefab/ui/ui_select.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/ui/ui_select.tscn)

Отображает сетку уровней (по 4 в ряд). Закрытые уровни помечены иконкой замка. Формат отображения: `Эпизод-Уровень` (например, `1-3`).

### 6.3 Игровой экран (game)

**Файлы:**
- [`script/game/game.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/game.gd)
- [`prefab/ui/ui_game.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/ui/ui_game.tscn)

В верхней панели:
- Номер уровня (формат: `Уровень #Э-Л`)
- Кнопка Reset (сброс уровня)
- Кнопка Menu (открывает диалог паузы `gmenu`)

### 6.4 Диалог паузы (gmenu)

**Файлы:**
- [`script/game/dlg/gmenu.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/dlg/gmenu.gd)
- [`prefab/dlg/gmenu.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/dlg/gmenu.tscn)

| Кнопка | Переход |
|--------|---------|
| Resume | Закрыть диалог → продолжить игру |
| Level select | Закрыть диалог → экран выбора уровня |
| Main Menu | Закрыть диалог → главное меню |

### 6.5 Диалог завершения уровня (lvl_completed)

**Файлы:**
- [`script/game/dlg/lvl_completed.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/dlg/lvl_completed.gd)
- [`prefab/dlg/lvl_completed.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/dlg/lvl_completed.tscn)

Отображает:
- Номер уровня
- Количество ходов
- Время прохождения

| Кнопка (иконка) | Переход |
|----------------|---------|
| Reset | Перезапуск текущего уровня |
| Home | Главное меню |
| Play (Next) | Следующий уровень |

### 6.6 Экран помощи (help)

**Файлы:**
- [`script/menu/help.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/menu/help.gd)
- [`prefab/ui/ui_help.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/ui/ui_help.tscn)

Содержит текст с правилами и управлением. Кнопка «Назад» → главное меню.

### 6.7 Экран «О игре» (about)

**Файлы:**
- [`script/menu/about.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/menu/about.gd)
- [`prefab/ui/ui_about.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/ui/ui_about.tscn)

Содержит кредиты команды. Кнопка «Назад» → главное меню.

---

## 7. Цепочки выполнения (State Flows)

### 7.1 Главный цикл уровня (Game FSM)

```
[start_game]
     │
     ▼
┌─────────┐    (анимация волн, ~0.025с/волна)    ┌─────────┐
│ create  │ ──────────────────────────────────────▶│  input  │
└─────────┘                                       └────┬────┘
                                                      │
                                    move_box(dir)      │
                                                      ▼
┌──────────┐   finished    ┌─────────┐           ┌─────────┐
│ completed│◀──────────────│  check  │◀──────────│  move   │
└──────────┘               └────┬────┘           └─────────┘
                                │
                     not completed│
                                ▼
                          ┌─────────┐
                          │  input  │ (возврат)
                          └─────────┘
```

### 7.2 Меню FSM

```
[ready] → mmenu (start_state)

mmenu:
  - Config.GAME_DEMO_MODE = true
  - resume_update()
  - Показать ui_mmenu

selector:
  - Config.GAME_DEMO_MODE = true
  - Обновить статус уровней
  - Показать ui_select

game:
  - Config.GAME_DEMO_MODE = false
  - game.reset()
  - Показать ui_game

help:
  - Config.GAME_DEMO_MODE = true
  - Показать ui_help

about:
  - Config.GAME_DEMO_MODE = true
  - Показать ui_about
```

### 7.3 Диалоги

```
show_dlg(name):
  1. Инстанцировать сцену диалога
  2. Добавить как дочерний узел
  3. Показать
  4. get_tree().paused = true

hide_dlg(name):
  1. Найти диалог по имени
  2. Скрыть + queue_free()
  3. get_tree().paused = false
```

---

## 8. Визуальные эффекты

### 8.1 Появление уровня (Create State)

Объекты уровня появляются волнами от случайных точек (BFS-волна, интервал 25мс). Создаёт эффект «прорастания» уровня.

**Файл:** [`script/game/state/create_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/create_state.gd)

### 8.2 Анимация движения кубиков

- **Tween** с параметрами: `EASE_OUT`, `TRANS_CIRC`
- Скорость пропорциональна расстоянию (`speed * length`, где `speed = 0.07`)
- Все кубики двигаются параллельно
- Воспроизводится звук свайпа при каждом движении

**Файл:** [`script/game/state/move_state.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/state/move_state.gd)

### 8.3 Частицы на целевых площадках

Префаб `end.tscn` содержит `GPUParticles3D` с параметрами:
- Форма эмиссии: кольцо (радиус 0.5, высота 0.5)
- Гравитация: `(0, 0.5, 0)` (вверх)
- Цвет частиц: жёлтый `(1, 0.98, 0.23)`
- Форма частиц: маленький кубик (0.1×0.1×0.1)
- По умолчанию `emitting = false` (активируется при попадании кубика)

**Файл:** [`prefab/end.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/end.tscn)

### 8.4 UI через 3D-плоскости (SubViewport → QuadMesh)

Все UI-экраны рендерятся в `SubViewport` (540×960), текстура которого выводится на `QuadMesh` (5×9) в 3D-сцене. Взаимодействие происходит через `Area3D` с конвертацией координат 3D→2D.

**Файл:** [`script/gui_3d.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/gui_3d.gd)

---

## 9. Звуковые эффекты

| Звук | Файл | Когда |
|------|------|--------|
| Свайп | [`sfx/wav (SD)/JDSherbert - Ultimate UI SFX Pack - Swipe - 2.wav`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/sfx/) | При движении кубиков (не в демо-режиме) |
| Появление сообщения | [`sfx/use/UI Message Appear 01.wav`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/sfx/use/UI%20Message%20Appear%2001.wav) | При показе диалога завершения уровня |

---

## 10. Сохранения и статистика

### 10.1 Конфигурация (Config)

- **Файл:** `user://config.json` (debug) или `user://config.data` (release, зашифрован паролем `TwoBoxPuzzle2024`)
- **Автосохранение:** каждые 2 секунды при изменении переменных
- **Переменные:**
  - `game.mode.demo` — демо-режим
  - `sfx.volume` — громкость звуков (по умолчанию 0.5)
  - `save.game` — данные сохранения

**Файл:** [`script/global/config.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/config.gd)

### 10.2 Система сохранений (Save)

Сохраняет состояние всех узлов в группе `"serialize"`:
- `EpisodeMng` — текущий эпизод, текущий уровень, разблокированные уровни
- Версия сохранения: 1

**Файл:** [`script/global/save.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/global/save.gd)

### 10.3 Статистика (Statistics)

| Метрика | Тип | Описание |
|---------|-----|----------|
| `counter` | CounterVar | Количество ходов за уровень |
| `timer` | TimerVar | Время прохождения уровня |

**Файл:** [`script/statistics/statistics.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/statistics/statistics.gd)

---

## 11. Локализация

Поддерживаются два языка: **английский** и **русский**.

**Исходный файл:** [`loc/puzzle_game.csv`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/loc/puzzle_game.csv)

| ID | EN | RU |
|----|----|----|
| ID_PLAY | Play | Играть |
| ID_OPTIONS | Options | Настройки |
| ID_HELP | Help | Помощь |
| ID_TITLE | 2Box | 2Box |
| ID_LVL_NUM | Level #%d-%d | Уровень #%d-%d |
| ID_RESUME | Resume | Продолжить |
| ID_EXIT | Exit | Выход |
| ID_PAUSE | Pause | Пауза |
| ID_LVL_SELECTOR | Level select | Выбрать уровень |
| ID_MMENU | Main Menu | Главное Меню |
| ID_TITLE_SELECT_LVL | Select Levels | Выбор уровня |
| ID_RESET | Reset | Сбросить |
| ID_MOVE | Move | Двигать |
| ID_COMPLETED | Completed! | Пройден! |
| ID_BACK | Back | Назад |
| ID_EPISODE_NUM | Episode #%d | Эпизод #%d |
| ID_TIME | Time: %s | Время: %s |
| ID_MOVES_COUNT | Number of moves: %d | Количество ходов %d |

---

## 12. Визуальные ресурсы

### 12.1 Материалы

| Материал | Файл | Цвет |
|----------|------|------|
| Кубик/цель ONE | [`res/mat_color_one.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_color_one.tres) | Красный `(235, 31, 27)` |
| Кубик/цель TWO | [`res/mat_color_two.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_color_two.tres) | Жёлтый `(192, 182, 28)` |
| Стена | [`res/mat_wall.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_wall.tres) | Голубой `(44, 107, 160)` |
| Пол | [`res/mat_floor.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/mat_floor.tres) | Тёмно-голубой `(28, 68, 102)` |
| Кнопки UI | [`res/ui_btn_shader_mat.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/ui_btn_shader_mat.tres) | — |

### 12.2 Префабы

| Префаб | Файл | Описание |
|--------|------|----------|
| Кубик | [`prefab/box.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/box.tscn) | BoxMesh 0.9×1×0.9 |
| Цель | [`prefab/end.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/end.tscn) | QuadMesh 0.8×0.8 + GPUParticles3D |
| Стена | [`prefab/wall.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/wall.tscn) | BoxMesh 1×0.5×1 |
| Пол | [`prefab/floor.tscn`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/prefab/floor.tscn) | BoxMesh 1×0.25×1 + Grid lines |

### 12.3 Освещение и окружение

- **WorldEnvironment** ([`res/cam_envir.tres`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/res/cam_envir.tres)):
  - Фон: серый `(0.78, 0.78, 0.78)`
  - Ambient light: источник цвета фона
  - Reflected light: источник цвета фона
- **DirectionalLight3D**: наклонный направленный свет

### 12.4 Камера

- Ортографическая 3D-камера (`size = 25.0`)
- Фиксированный изометрический ракурс (поворот через `cam_point`)
- UI-плоскости расположены на расстоянии `z = -5.8` от камеры

---

## 13. Разблокировка уровней

- Переменная `unlocked_all` в `Episode` (по умолчанию `false`)
- `last_unloked_lvl` отслеживает максимальный разблокированный уровень
- При прохождении уровня `last_unloked_lvl = max(last_unloked_lvl, cur_lvl_id + 1)`
- В селекторе уровни с `idx >= last_unlock_id` отображаются заблокированными (иконка замка)
- Уровень 1 каждого эпизода всегда доступен

**Файл:** [`script/game/levels/episode.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/game/levels/episode.gd)

---

## 14. Уровни

### 14.1 Эпизод 1 (Episode 1)

**Файл:** [`db/episode_1.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/db/episode_1.gd)  
**Количество уровней:** 12

#### Легенда для карт:
| Символ | Значение |
|--------|----------|
| `#` | Стена (1) |
| `.` | Свободная клетка (0) |
| `R` | Красный кубик (2) |
| `Y` | Жёлтый кубик (4) |
| `r` | Красная цель (3) |
| `y` | Жёлтая цель (5) |
| ` ` | Игнорируется (-1) |

---

#### Уровень 1-1 (7×9)
```
## # ##
#######
 #R.Y# 
 ##.##
##.# ##
# y r.#
#######
## # ##
```

#### Уровень 1-2 (10×10)
```
 ##      
   ###   
 # ###y##
   ...Y# 
 ###.# ##
 #R....# 
 ##.### #
  #.r#   
  #### # 
```

#### Уровень 1-3 (11×12)
```
    ####   
   ####### 
 # #..## # 
  ##..R##  
   y...#   
   r.#.#   
  ###...## 
 # ##Y###  
   ####    
    # ## # 
   ####    
    ##     
```

#### Уровень 1-4 (10×13)
```
    #     
  #  #    
 #   #    
#######   
.Y...###  
.#.##.# ##
..R..#  # 
.#.##.#  #
.yr#.# ###
......r## 
###.#.### 
 ##...##  
  #####   
```

#### Уровень 1-5 (12×12)
```
     ####   
   ##..##   
  #....#  ##
   ##.#.. # 
   #...##.# 
 ###.#...#  
##R.y#.##.##
 #Y#r....#  
 #########  
   #  #  #  
```

#### Уровень 1-6 (12×12)
```
     #####  #
   ##...#   
   #Y..#.# ##
  ##.#.r..##
  #R.#....# 
  ##......# 
   #####..##
       #.## 
    #  #y#  
    #  ###  
```

#### Уровень 1-7 (12×12)
```
 ##       ##
  #      #  
   #    #   
############
#R.y##.r.Y#
#.#....#..# 
#.#....#..# 
#.#....#..# 
#..####...# 
##......##  
############
  #      #  
```

#### Уровень 1-8 (12×12)
```
    #  #  # 
    # #   # 
  # ###.#  #
  # #y#.# ##r#
  ##..#...#.#
 # ##.....##
 #Y#.#..#  ##
#...#..## # 
#..#...##  ##
#R##.#.#  # 
 # # ##  #  
    # #   # 
```

#### Уровень 1-9 (12×12)
```
  ##########
  #...R..#  
  ###..#.#  
  ##...#.#  
  #..r.#.#  
  #..##...# 
  #..y#.#  
  #...#Y##  
  #.##...#  
  #.##.#..# 
  ##########
```

#### Уровень 1-10 (12×13)
```
            
     ###    
    #...#   
   #..#..#  
  #R.###..# 
  #.##...#  
  #..#...r# 
  #..y#...# 
  ##.#.##Y# 
   #..#..#  
    #...#   
     ###    
```

#### Уровень 1-11 (13×13)
```
   #  #  #   
     # #     
    #.r.#    
 # ###.# ##  
  # ##..#    
 ##R....Y##  
#.......#.#  
 ##...#..#   
  #.....#    
 # ###.#y#   
  ##.#.#     
   #######   
   #  #  #   
```

#### Уровень 1-12 (13×13)
```
       # # # 
      # ## # 
       # # # 
      ### # #
     #.#R.###
    #.....#  
    #.r..#   
   y...#     
   #..#.#    
   #..Y#     
  #...#      
  #..#       
  ##         
```

---

### 14.2 Эпизод 2 (Episode 2)

**Файл:** [`db/episode_2.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/db/episode_2.gd)  
**Количество уровней:** 2

> **Примечание:** Эпизод 2 определён в данных (`db/episode_2.gd`), но в текущей сборке **закомментирован** в `episode_mng.gd` (строка `# Episode2.new()`). То есть он **недоступен** в игре.

#### Уровень 2-1 (7×9)
Идентичен уровню 1-1:
```
## # ##
#######
 #R.Y# 
 ##.##
##.# ##
# y r.#
#######
## # ##
```

#### Уровень 2-2 (10×10)
Идентичен уровню 1-2:
```
 ##      
   ###   
 # ###y##
   ...Y# 
 ###.# ##
 #R....# 
 ##.### #
  #.r#   
  #### # 
```

---

## 15. Технические особенности

### 15.1 Отображение

- **Разрешение:** 480×854 (портретная ориентация)
- **Метод рендеринга:** `gl_compatibility` (максимальная совместимость)
- **Стретчинг:** `canvas_items` с aspect `expand`
- **Текстуры:** ETC2/ASTC компрессия

### 15.2 Сетка поля

Каждая клетка имеет размер 1×1 в 3D-координатах. Поле центрируется с учётом округления до ближайшего чётного размера (`Util.po2`).

### 15.3 Вспомогательные классы

| Класс | Файл | Назначение |
|-------|------|-----------|
| `Array2D` | [`script/util/array_2d.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/util/array_2d.gd) | 2D-массив с доступом по `Vector2i` |
| `Util` | [`script/util/util.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/util/util.gd) | `po2()` (округление до чётного), `create_lvl()` (обновление карты с учётом позиций кубиков) |
| `GenId` | [`script/util/gen_id.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/util/gen_id.gd) | Генератор инкрементных ID |

### 15.4 Отладка

- **FPS-счётчик** в левом нижнем углу экрана
  - **Файл:** [`script/debug/fps.gd`](https://bitbucket.org/reTTT/2boxpuzzle/src/master/script/debug/fps.gd)
- **Debug-метка тач-координат** (скрыта по умолчанию)
  - Выводит позиции начала/конца свайпа и направление

---

## 16. Структура папок проекта

```
2boxpuzzle/
├── project.godot          — конфигурация проекта
├── db/                    — данные уровней (эпизоды)
│   ├── episode_1.gd
│   └── episode_2.gd
├── fnt/                   — шрифты (Murecho)
├── icon/                  — иконки (SVG)
├── loc/                   — локализация
├── prefab/                — префабы/сцены
│   ├── box.tscn
│   ├── end.tscn
│   ├── wall.tscn
│   ├── floor.tscn
│   ├── dlg/              — диалоги
│   ├── icon/             — иконки-кнопки
│   ├── lvl/              — элементы селектора уровней
│   └── ui/               — UI-экраны
├── res/                   — ресурсы (материалы, окружение)
├── scn/                   — сцены
│   └── game.tscn         — главная сцена (всё в одном)
├── script/                — исходный код GDScript
│   ├── 2box.gd           — корневой скрипт (пустой)
│   ├── FSM/              — реализация конечного автомата
│   ├── debug/            — отладочные утилиты
│   ├── game/             — игровая логика
│   │   ├── entiny/       — сущности (Entity, Box, EndPoint)
│   │   ├── input/        — системы ввода
│   │   ├── levels/       — данные уровней
│   │   ├── state/        — состояния игрового FSM
│   │   ├── ui/           — игровой UI
│   │   └── dlg/          — диалоги в игре
│   ├── global/           — глобальные синглтоны
│   ├── gui_3d.gd         — мост 3D→2D UI
│   ├── lvl_selector/     — выбор уровня
│   ├── menu/             — меню
│   │   └── states/       — состояния menu FSM
│   ├── statistics/       — статистика
│   └── util/             — утилиты
├── sfx/                   — звуковые эффекты
└── texture/               — текстуры (кнопки, splash)
```

---

## 17. Известные особенности / ограничения

1. **Одна сцена** — весь проект в одном файле `scn/game.tscn`. Нет отдельных сцен для меню.
2. **Episode 2** определён, но закомментирован в `episode_mng.gd` и неактивен.
3. **Кнопки Options и About** в главном меню скрыты/отключены (`visible = false`, `disabled = true`).
4. **Система звёзд** в селекторе уровней (3 звезды на `lvl.tscn`) не имеет логики начисления.
5. **Пауза** останавливает всё дерево (`get_tree().paused = true`), кроме узлов с `process_mode = 2` (Process/When Paused).
6. **Демо-режим** активен всегда, кроме состояния `game` в menuFSM — это даёт анимированный фон в меню.
7. **Нет кнопки выхода** из приложения в меню (идентификатор `ID_EXIT` определён в локализации, но не используется).

---

## 18. Скриншоты визуального стиля

Игра использует минималистичный 3D-стиль:
- Гладкие однотонные материалы без текстур
- Простая геометрия (кубы, плоскости)
- Тёмно-синие пол и стены
- Контрастные красный и жёлтый для кубиков и целей
- Светло-серый фон
- Изометрическая проекция
