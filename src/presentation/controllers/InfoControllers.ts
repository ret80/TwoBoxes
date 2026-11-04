/**
 * Контроллеры статических экранов (планы 11.8, 11.9):
 * Help и About — только показ/скрытие; кнопка «Назад» → mmenu
 * обрабатывается в MenuController (построение экрана).
 */

export class HelpController {
  /** Экран помощи управляется MenuController; класс-маркер для расширения (анимации, контент). */
  static readonly SCREEN_NAME = 'help';
}

export class AboutController {
  static readonly SCREEN_NAME = 'about';
}
