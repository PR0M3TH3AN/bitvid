import { applyDynamicStyles } from '../ui/styleSystem.js';

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : Array.from(value);
}

export function createCarousel(container, options = {}) {
  const track = options.track || container?.querySelector('[data-carousel-track]');
  const slides = options.slides || toArray(track?.children);
  if (!container || !track || slides.length === 0) {
    return null;
  }

  const perPage = Math.max(1, Math.min(options.perPage || 1, slides.length));
  const state = {
    container,
    track,
    slides,
    perPage,
    loop: Boolean(options.loop),
    autoPlayInterval: Math.max(0, options.autoPlayInterval || 0),
    index: 0,
    progress: null,
    cleanup: [],
    setProgress(progressInstance) {
      this.progress = progressInstance || null;
    },
  };

  container.classList.add('splide', 'is-initialized');
  container.classList.add('is-active');
  applyDynamicStyles(track, { transition: 'transform 420ms ease' }, { slot: 'transition' });

  const basis = 100 / perPage;
  slides.forEach((slide) => {
    slide.classList.add('splide__slide');
    applyDynamicStyles(slide, { flex: `0 0 ${basis}%`, maxWidth: `${basis}%` }, { slot: 'size' });
  });

  function updateActiveSlides() {
    const offset = (state.index * 100) / state.perPage;
    applyDynamicStyles(track, { transform: `translateX(-${offset}%)` }, { slot: 'position' });

    state.slides.forEach((slide, idx) => {
      const inRange = idx >= state.index && idx < state.index + state.perPage;
      slide.classList.toggle('is-active', inRange);
      slide.setAttribute('aria-hidden', inRange ? 'false' : 'true');
    });
  }

  state.goTo = function goTo(targetIndex, { restartProgress = true } = {}) {
    const maxIndex = Math.max(0, state.slides.length - state.perPage);
    let nextIndex = targetIndex;

    if (nextIndex < 0) {
      nextIndex = state.loop ? maxIndex : 0;
    } else if (nextIndex > maxIndex) {
      nextIndex = state.loop ? 0 : maxIndex;
    }

    state.index = nextIndex;
    updateActiveSlides();

    if (restartProgress && state.autoPlayInterval > 0 && state.progress) {
      state.progress.reset();
      state.progress.start(state.autoPlayInterval);
    }
  };

  const prevHandler = (event) => {
    event?.preventDefault();
    advanceSlide(state, -1);
  };
  const nextHandler = (event) => {
    event?.preventDefault();
    advanceSlide(state, 1);
  };

  if (options.controls?.prev) {
    options.controls.prev.addEventListener('click', prevHandler);
    state.cleanup.push(() => options.controls.prev.removeEventListener('click', prevHandler));
  }

  if (options.controls?.next) {
    options.controls.next.addEventListener('click', nextHandler);
    state.cleanup.push(() => options.controls.next.removeEventListener('click', nextHandler));
  }

  state.goTo(state.index, { restartProgress: false });
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
      console.warn('Failed to dispose carousel listener', error);
    }
  });
  state.cleanup = [];

  if (state.progress && typeof state.progress.destroy === 'function') {
    state.progress.destroy();
  }

  if (state.container) {
    state.container.classList.remove('is-initialized');
    state.container.classList.remove('is-active');
  }
}
