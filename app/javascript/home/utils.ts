export const noop: () => void = () => {};

export const forRange = async (
  start: number,
  stop: number,
  func: (index: number) => Promise<boolean | void>
): Promise<void> => {
  for (let i = start; i < stop; i += 1) {
    const stop = await func(i);
    if (stop) return;
  }
};

export function* take<T>(generator: Generator<T>, count: number) {
  for (let i = 0; i < count; i++) {
    const result = generator.next();
    if (result.done) {
      break;
    }
    yield result.value;
  }
}