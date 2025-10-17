export function mountProgressBar(
  container,
  { initialDuration = 0, autoStart = false, onComplete } = {},
) {
  if (!container) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'blog-carousel__progress blog-progress mt-2';
  wrapper.dataset.state = 'idle';
  wrapper.setAttribute('data-carousel-progress', 'true');

  const meter = document.createElement('progress');
  meter.className = 'progress progress--blog';
  meter.max = 100;
  meter.value = 0;
  meter.dataset.progress = '0';
  meter.dataset.state = 'idle';
  meter.setAttribute('data-progress-meter', 'true');
  meter.setAttribute('data-variant', 'blog');
  meter.setAttribute('aria-label', 'Carousel progress');
  meter.setAttribute('aria-valuetext', 'Carousel progress 0% complete');
  wrapper.appendChild(meter);
  container.appendChild(wrapper);

  let duration = Math.max(0, initialDuration);
  let rafId = null;
  let startTimestamp = null;
  let completeHandler = typeof onComplete === 'function' ? onComplete : null;

  function cancelAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setState(state) {
    wrapper.dataset.state = state;
    meter.dataset.state = state;
  }

  function updateMeter(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const percent = Math.round(clamped * 100);
    meter.value = percent;
    meter.dataset.progress = String(percent);
    meter.setAttribute('aria-valuetext', `Carousel progress ${percent}% complete`);
    return clamped;
  }

  function stop() {
    cancelAnimation();
    startTimestamp = null;
    setState('paused');
  }

  function reset() {
    stop();
    updateMeter(0);
    setState('idle');
  }

  function step(timestamp) {
    if (startTimestamp === null) {
      startTimestamp = timestamp;
    }
    const elapsed = timestamp - startTimestamp;
    const ratio = duration > 0 ? Math.min(1, elapsed / duration) : 1;
    const progress = updateMeter(ratio);

    if (progress >= 1) {
      cancelAnimation();
      startTimestamp = null;
      setState('complete');
      if (completeHandler) {
        completeHandler();
      }
      return;
    }

    setState('active');
    rafId = requestAnimationFrame(step);
  }

  function start(nextDuration = duration) {
    duration = Math.max(0, nextDuration);
    reset();
    if (duration === 0) {
      updateMeter(1);
      setState('complete');
      if (completeHandler) {
        completeHandler();
      }
      return;
    }
    setState('active');
    rafId = requestAnimationFrame(step);
  }

  function destroy() {
    cancelAnimation();
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
    meter,
    start,
    stop,
    reset,
    destroy,
    setOnComplete,
  };
}
