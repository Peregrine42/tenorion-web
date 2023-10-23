export const requestInterval = (
  fn: () => void,
  delay: number
): { value?: number } => {
  if (!requestAnimationFrame) return { value: setInterval(fn, delay) };

  var start = new Date().getTime(),
    handle: { value?: number } = new Object();

  const loop = () => {
    var current = new Date().getTime(),
      delta = current - start;

    if (delta >= delay) {
      fn();
      start = new Date().getTime();
    }

    handle.value = requestAnimationFrame(loop);
  };

  handle.value = requestAnimationFrame(loop);
  return handle;
};

/**
 * Behaves the same as clearInterval except uses cancelRequestAnimationFrame() where possible for better performance
 * @param {int|object} fn The callback function
 */
export const clearRequestInterval = (handle: { value?: number }) => {
  if (handle.value) cancelAnimationFrame(handle.value);
};

export const requestTimeout = (fn: () => void, delay: number) => {
  var start = new Date().getTime(),
    handle: { value?: number } = new Object();

  function loop() {
    var current = new Date().getTime(),
      delta = current - start;

    delta >= delay ? fn() : (handle.value = requestAnimationFrame(loop));
  }

  handle.value = requestAnimationFrame(loop);
  return handle;
};
