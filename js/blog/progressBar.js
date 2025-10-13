import { applyDynamicStyles } from '../ui/styleSystem.js';

export function mountProgressBar(
  container,
  { initialDuration = 0, autoStart = false, onComplete } = {},
) {
  if (!container) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className =
    'splide__progress mt-2 h-1 w-full overflow-hidden rounded-full bg-blog-neutral-100 dark:bg-blog-neutral-800';

  const fill = document.createElement('div');
  fill.className = 'splide__progress__bar h-full bg-blog-purple transition-none';
  wrapper.appendChild(fill);
  container.appendChild(wrapper);

  let duration = Math.max(0, initialDuration);
  let rafId = null;
  let startTimestamp = null;
  let completeHandler = typeof onComplete === 'function' ? onComplete : null;

  function updateWidth(ratio) {
    const width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    applyDynamicStyles(fill, { width }, { slot: 'width' });
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    startTimestamp = null;
  }

  function reset() {
    stop();
    updateWidth(0);
  }

  function step(timestamp) {
    if (startTimestamp === null) {
      startTimestamp = timestamp;
    }
    const elapsed = timestamp - startTimestamp;
    const ratio = duration > 0 ? Math.min(1, elapsed / duration) : 1;
    updateWidth(ratio);

    if (ratio >= 1) {
      stop();
      if (completeHandler) {
        completeHandler();
      }
      return;
    }

    rafId = requestAnimationFrame(step);
  }

  function start(nextDuration = duration) {
    duration = Math.max(0, nextDuration);
    reset();
    if (duration === 0) {
      updateWidth(1);
      if (completeHandler) {
        completeHandler();
      }
      return;
    }
    rafId = requestAnimationFrame(step);
  }

  function destroy() {
    stop();
    wrapper.remove();
  }

  function setOnComplete(handler) {
    completeHandler = typeof handler === 'function' ? handler : null;
  }

  if (autoStart && duration > 0) {
    start(duration);
  } else {
    reset();
  }

  return {
    element: wrapper,
    start,
    stop,
    reset,
    destroy,
    setOnComplete,
  };
}
