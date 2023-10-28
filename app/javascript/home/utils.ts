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