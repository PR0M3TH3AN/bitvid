import { userLogger } from "../utils/logger.js";
function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : Array.from(value);
}

const SLIDE_STATE_IDLE = 'idle';
const SLIDE_STATE_ACTIVE = 'active';
const SLIDE_STATE_LEAVING = 'leaving';
const SLIDE_TRANSITION_TIMEOUT = 420;

function getRange(pageIndex, perPage) {
  const start = pageIndex * perPage;
  return { start, end: start + perPage };
}

function clearTimer(state, slide) {
  const handle = state.timers.get(slide);
  if (typeof handle === 'number') {
    clearTimeout(handle);
  }
  state.timers.delete(slide);
}

function scheduleSlideIdle(state, slide) {
  clearTimer(state, slide);
  const handle = setTimeout(() => {
    state.timers.delete(slide);
    if (slide.dataset.active !== 'true') {
      slide.dataset.state = SLIDE_STATE_IDLE;
    }
  }, SLIDE_TRANSITION_TIMEOUT);
  state.timers.set(slide, handle);
}

function applySlideState(state, slide, { isActive, wasActive, immediate }) {
  if (isActive) {
    clearTimer(state, slide);
    slide.dataset.active = 'true';
    slide.dataset.state = SLIDE_STATE_ACTIVE;
    slide.dataset.inert = 'false';
    slide.setAttribute('aria-hidden', 'false');
    return;
  }

  slide.dataset.active = 'false';
  slide.dataset.inert = 'true';
  slide.setAttribute('aria-hidden', 'true');

  if (!immediate && wasActive) {
    slide.dataset.state = SLIDE_STATE_LEAVING;
    scheduleSlideIdle(state, slide);
    return;
  }

  clearTimer(state, slide);
  slide.dataset.state = SLIDE_STATE_IDLE;
}

function updateSlides(state, { previousIndex, immediate = false } = {}) {
  const currentRange = getRange(state.index, state.perPage);
  const previousRange =
    typeof previousIndex === 'number' ? getRange(previousIndex, state.perPage) : currentRange;

  state.slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex >= currentRange.start && slideIndex < currentRange.end;
    const wasActive = slideIndex >= previousRange.start && slideIndex < previousRange.end;
    applySlideState(state, slide, { isActive, wasActive, immediate });
  });
}

function syncTransitionMode(container, track, mode) {
  if (!container || !track) {
    return;
  }

  if (mode) {
    container.dataset.transition = mode;
    track.dataset.transition = mode;
  } else {
    delete container.dataset.transition;
    delete track.dataset.transition;
  }
}

export function createCarousel(container, options = {}) {
  const track = options.track || container?.querySelector('[data-carousel-track]');
  const slides = options.slides || toArray(track?.children);
  if (!container || !track || slides.length === 0) {
    return null;
  }

  const perPage = Math.max(1, Math.min(options.perPage || 1, slides.length));
  const pageCount = Math.max(1, Math.ceil(slides.length / perPage));

  const state = {
    container,
    track,
    slides,
    perPage,
    pageCount,
    loop: Boolean(options.loop),
    autoPlayInterval: Math.max(0, options.autoPlayInterval || 0),
    index: 0,
    progress: null,
    cleanup: [],
    timers: new Map(),
    setProgress(progressInstance) {
      this.progress = progressInstance || null;
    },
  };

  container.dataset.count = String(pageCount);
  container.dataset.perPage = String(perPage);
  container.dataset.index = '0';
  container.dataset.state = pageCount > 1 ? 'active' : 'idle';

  syncTransitionMode(container, track, 'auto');

  slides.forEach((slide, slideIndex) => {
    slide.dataset.index = String(slideIndex);
    slide.dataset.active = 'false';
    slide.dataset.state = SLIDE_STATE_IDLE;
    slide.dataset.inert = 'true';
    slide.setAttribute('aria-hidden', 'true');
  });

  function handlePrev(event) {
    event?.preventDefault?.();
    advanceSlide(state, -1);
  }

  function handleNext(event) {
    event?.preventDefault?.();
    advanceSlide(state, 1);
  }

  if (options.controls?.prev) {
    options.controls.prev.addEventListener('click', handlePrev);
    state.cleanup.push(() => options.controls.prev.removeEventListener('click', handlePrev));
  }

  if (options.controls?.next) {
    options.controls.next.addEventListener('click', handleNext);
    state.cleanup.push(() => options.controls.next.removeEventListener('click', handleNext));
  }

  state.goTo = function goTo(targetPage, { restartProgress = true, instant = false } = {}) {
    const maxIndex = state.pageCount - 1;
    let nextIndex = targetPage;

    if (nextIndex < 0) {
      nextIndex = state.loop ? maxIndex : 0;
    } else if (nextIndex > maxIndex) {
      nextIndex = state.loop ? 0 : maxIndex;
    }

    const previousIndex = state.index;
    state.index = nextIndex;

    container.dataset.index = String(nextIndex);

    syncTransitionMode(container, track, instant ? 'instant' : 'auto');

    updateSlides(state, { previousIndex, immediate: instant });

    if (instant) {
      syncTransitionMode(container, track, 'auto');
    }

    if (restartProgress && state.autoPlayInterval > 0 && state.progress) {
      state.progress.reset();
      state.progress.start(state.autoPlayInterval);
    }
  };

  state.goTo(0, { restartProgress: false, instant: true });

  return state;
}

export function advanceSlide(state, step = 1, options = {}) {
  if (!state || typeof state.goTo !== 'function') {
    return;
  }
  state.goTo(state.index + step, options);
}

export function destroyCarousel(state) {
  if (!state) {
    return;
  }

  state.cleanup?.forEach((dispose) => {
    try {
      dispose();
    } catch (error) {
      userLogger.warn('Failed to dispose carousel listener', error);
    }
  });
  state.cleanup = [];

  for (const handle of state.timers.values()) {
    clearTimeout(handle);
  }
  state.timers.clear();

  if (state.progress && typeof state.progress.destroy === 'function') {
    state.progress.destroy();
  }

  if (state.container) {
    delete state.container.dataset.index;
    delete state.container.dataset.count;
    delete state.container.dataset.perPage;
    delete state.container.dataset.state;
    delete state.container.dataset.transition;
  }

  if (state.track) {
    delete state.track.dataset.transition;
  }

  state.slides?.forEach((slide) => {
    delete slide.dataset.active;
    delete slide.dataset.state;
    delete slide.dataset.inert;
    slide.setAttribute('aria-hidden', 'false');
  });
}