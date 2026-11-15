import type { LocaleManager } from '../i18n/LocaleManager';
import { buildTutorialDialog } from '../html/screens';
import { tutorialKey, type TutorialTopic } from '../tutorials';

/**
 * Контроллер диалога обучения. Показывается поверх поля, когда игрок впервые
 * встречает механику, и держит ввод заблокированным, пока его не закроют.
 *
 * Флаг обучения и чекбокс «Не показывать» — одна и та же настройка `tutorial`:
 * диалог только читает её (`isEnabled`) и пишет (`setEnabled`), поэтому
 * переключатель в опциях и здесь всегда совпадают.
 */
export class TutorialDialogController {
  private root!: HTMLElement;
  private titleEl!: HTMLElement;
  private textEl!: HTMLElement;
  private checkEl!: HTMLInputElement;
  private topic: TutorialTopic | null = null;
  private container: HTMLElement;
  private i18n: LocaleManager;
  private audio: { playSfx(name: string): void };
  private isEnabled: () => boolean;
  private setEnabledFlag: (enabled: boolean) => void;
  private onVisibility?: (visible: boolean) => void;

  constructor(
    container: HTMLElement,
    i18n: LocaleManager,
    audio: { playSfx(name: string): void },
    handlers: {
      isEnabled: () => boolean;
      setEnabled: (enabled: boolean) => void;
      /** Открытие/закрытие диалога — для размытия сцены и блокировки ввода. */
      onVisibility?: (visible: boolean) => void;
    },
  ) {
    this.container = container;
    this.i18n = i18n;
    this.audio = audio;
    this.isEnabled = handlers.isEnabled;
    this.setEnabledFlag = handlers.setEnabled;
    this.onVisibility = handlers.onVisibility;
    this.build();
    // Смена языка перестраивает подписи; открытый диалог остаётся открытым.
    i18n.subscribe(() => this.build());
  }

  private build(): void {
    const wasVisible = !!this.root && this.visible;
    this.root?.remove();
    const { root, title, text, check } = buildTutorialDialog(
      this.i18n,
      { dontShow: !this.isEnabled() },
      {
        onDontShowChange: (value) => {
          this.setEnabledFlag(!value);
          // Настройка могла измениться извне (опции) — сверяем чекбокс.
          check.checked = !this.isEnabled();
        },
        onClose: () => this.hide(),
      },
    );
    this.root = root;
    this.titleEl = title;
    this.textEl = text;
    this.checkEl = check;
    this.container.appendChild(root);
    if (this.topic) this.render(this.topic);
    if (wasVisible) this.root.classList.remove('dialog--hidden');
  }

  /** Подписи темы: заголовок и абзацы текста. */
  private render(topic: TutorialTopic): void {
    const keys = tutorialKey(topic);
    this.titleEl.textContent = this.i18n.t(keys.title);
    this.textEl.innerHTML = '';
    for (const paragraph of this.i18n.t(keys.body).split('\n\n')) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      this.textEl.appendChild(p);
    }
    this.checkEl.checked = !this.isEnabled();
  }

  show(topic: TutorialTopic): void {
    this.topic = topic;
    this.render(topic);
    this.root.classList.remove('dialog--hidden');
    this.audio.playSfx('message-appear');
    this.onVisibility?.(true);
  }

  hide(): void {
    this.topic = null;
    this.root.classList.add('dialog--hidden');
    this.onVisibility?.(false);
  }

  get visible(): boolean {
    return !this.root.classList.contains('dialog--hidden');
  }
}
