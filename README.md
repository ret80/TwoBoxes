# 2Box Puzzle (Web)

Головоломка в стиле Sokoban: **все** кубики на поле одновременно скользят в выбранном направлении до упора. Цель — поставить каждый кубик на целевую площадку того же цвета. Порт оригинальной игры на Godot ([bitbucket.org/reTTT/2boxpuzzle](https://bitbucket.org/reTTT/2boxpuzzle)) на TypeScript + picogl (WebGL2).

Документация оригинала: [`docs/game_documentation_2026-11-04.md`](docs/game_documentation_2026-11-04.md). План реализации: [`tasks/implementation_plan_2026-11-04.md`](tasks/implementation_plan_2026-11-04.md). Механики и их оценки: [`tasks/mechanics_2026-11-07.md`](tasks/mechanics_2026-11-07.md).

## Архитектура

Гексагональная (Ports & Adapters) + Component-based Domain, FSM на XState:

```
src/
├── core/          # Чистое ядро (0 зависимостей, 100% тестируемость)
│   ├── types/     # CellType, ColorType, Position, LevelGrid, Level, Episode...
│   ├── rules/     # Правила: create, move, check, reset (чистые функции)
│   ├── state/     # FSM: game (create→input→move→check→completed), menu
│   ├── generation/# Генератор уровней, BFS-решатель, модули механик
│   ├── services/  # Statistics, Config, EpisodeManager
│   └── data/      # Карты уровней (ASCII, как в оригинале: '#' '.' 'R' 'Y' 'r' 'y')
├── ports/         # Интерфейсы: IRenderer, IAudio, IInput, ISaveStorage, ITimeProvider
├── adapters/      # Реализации: picogl-рендер, WebAudio, ввод (keyboard/touch/gamepad/demo), localStorage
├── workers/       # Web Worker фоновой генерации эпизода 2
└── presentation/  # Экраны (DOM), контроллеры, i18n (en/ru), CSS (адаптивный)
```

Ядро не знает об адаптерах: FSM остаётся чистым, анимации подключаются контроллерами через подписку на переходы.

## Запуск

```bash
npm install
npm run dev        # dev-сервер с HMR
npm test           # unit/integration тесты (Vitest)
npm run lint       # строгая проверка типов (tsc --noEmit)
npm run build      # production-сборка в dist/
npm run preview    # предпросмотр сборки
```

## Управление

| Действие | Клавиатура | Тач | Gamepad |
|----------|-----------|-----|---------|
| Движение | Стрелки | Свайпы | D-pad / стик |
| Сброс уровня | R | — | — |
| Пауза | Escape | — | START |

## Игровой цикл

`create` (волновая анимация появления, BFS, 25 мс/волна) → `input` → `move` (tween, EASE_OUT/CIRC, 0.07 c на клетку) → `check` (победа = все цели закрыты кубиками того же цвета) → `completed` / `input`.

В меню (вне состояния `game`) работает демо-режим — автоигра случайными направлениями в качестве анимированного фона.

## Ключевые особенности порта

- 24 уровня (2 эпизода по 12; уровни эпизода 2 процедурный генератор строит в Web Worker, пока игрок в меню);
- генератор проверяет кратчайшее решение и отсутствие тупиков — тест прогоняет 20 сгенерированных уровней;
- подключаемые механики: порталы, ловушки, ротаторы, переключатель и односторонние клетки;
- отладочное меню `?debug` собирает тестовый уровень под выбранные механики и сложность;
- кубики блокируют друг друга: пути считаются в порядке «ведущий первым»;
- сохранение прогресса и разблокировка уровней (localStorage, версия v1);
- локализация EN/RU (18 строк, автоопределение языка);
- частицы на целевых площадках, волновое появление уровня, звук свайпа.
