/**
 * Общие операции над маской пола: связные компоненты и выбор крупнейшей.
 *
 * Раньше поиск компонент был продублирован в генераторе (`largestFloorComponent`)
 * и в паттерновой сборке. Одна реализация гарантирует, что «связное поле» в
 * обоих местах означает одно и то же.
 */

/**
 * Четырёхсвязные компоненты клеток, для которых `isOpen` вернул true.
 * Возвращает индексы `y * size + x`.
 */
export function connectedComponents(
  size: number,
  isOpen: (index: number) => boolean,
): number[][] {
  const seen = new Uint8Array(size * size);
  const components: number[][] = [];

  for (let start = 0; start < size * size; start++) {
    if (seen[start] || !isOpen(start)) continue;
    const component: number[] = [];
    const stack = [start];
    seen[start] = 1;

    const visit = (index: number): void => {
      if (seen[index] || !isOpen(index)) return;
      seen[index] = 1;
      stack.push(index);
    };

    while (stack.length) {
      const cell = stack.pop() as number;
      component.push(cell);
      const x = cell % size;
      const y = Math.floor(cell / size);
      if (x > 0) visit(cell - 1);
      if (x < size - 1) visit(cell + 1);
      if (y > 0) visit(cell - size);
      if (y < size - 1) visit(cell + size);
    }
    components.push(component);
  }

  return components;
}

/** Самая крупная компонента (по числу клеток); пустой массив — если таких нет. */
export function largestComponent(
  size: number,
  isOpen: (index: number) => boolean,
): number[] {
  let best: number[] = [];
  for (const component of connectedComponents(size, isOpen)) {
    if (component.length > best.length) best = component;
  }
  return best;
}

/**
 * Оставить только самую большую связную область пола: иначе стенки могут
 * разрезать поле на независимые комнаты и уровень выглядит сломанным.
 * `null` — площадь меньше порога.
 */
export function largestFloorComponent(
  floor: Uint8Array,
  size: number,
  minCells: number,
): Uint8Array | null {
  const best = largestComponent(size, (index) => floor[index] === 1);
  if (best.length < minCells) return null;
  const field = new Uint8Array(size * size);
  for (const cell of best) field[cell] = 1;
  return field;
}
