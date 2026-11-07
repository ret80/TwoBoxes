/**
 * Изменяемое состояние механик, которое переживает отдельный ход.
 *
 * Кубики и стены статичны, но ловушки и переключатели меняют состояние поля:
 * - `locks[i]` — сколько ходов кубик i ещё пропустит (ловушка);
 * - `rotorFlip` — переключатель перевернул все ротаторы.
 *
 * Состояние входит в ключ поиска решателя, иначе BFS считал бы разные позиции
 * кубиков на одинаковых клетках одним и тем же состоянием.
 */
export interface MechanicState {
  locks: number[];
  rotorFlip: boolean;
}

export function createMechanicState(boxCount: number, rotorFlip = false): MechanicState {
  return { locks: Array.from({ length: boxCount }, () => 0), rotorFlip };
}

export function cloneMechanicState(state: MechanicState): MechanicState {
  return { locks: [...state.locks], rotorFlip: state.rotorFlip };
}
