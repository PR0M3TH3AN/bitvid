import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, test } from 'node:test';

import { advanceSlide, createCarousel, destroyCarousel } from '../js/blog/carousel.js';
import { mountProgressBar } from '../js/blog/progressBar.js';
import {
  createBlogDomEnvironment,
  createSpy,
  readDynamicStyleRules,
} from './test-helpers/blog-dom.mjs';

const CAROUSEL_HTML = `
  <div data-carousel>
    <div data-carousel-track>
      <article data-slide="0">Slide 1</article>
      <article data-slide="1">Slide 2</article>
      <article data-slide="2">Slide 3</article>
    </div>
    <button type="button" data-carousel-prev>Prev</button>
    <button type="button" data-carousel-next>Next</button>
  </div>
`;

const PROGRESS_HTML = '<div id="progress-root"></div>';

describe('blog carousel', () => {
  let env;
  let container;
  let track;
  let slides;
  let prevButton;
  let nextButton;

  beforeEach(() => {
    env = createBlogDomEnvironment(CAROUSEL_HTML);
    const doc = env.document;
    container = doc.querySelector('[data-carousel]');
    track = container.querySelector('[data-carousel-track]');
    slides = Array.from(track.children);
    prevButton = container.querySelector('[data-carousel-prev]');
    nextButton = container.querySelector('[data-carousel-next]');

    env.inlineStyleGuard.guard(container);
    env.inlineStyleGuard.guard(track);
    env.inlineStyleGuard.guard(prevButton);
    env.inlineStyleGuard.guard(nextButton);
    slides.forEach((slide) => env.inlineStyleGuard.guard(slide));
  });

  afterEach(() => {
    env.cleanup();
  });

  test('initializes slides with dynamic styling and accessibility state', () => {
    const state = createCarousel(container, {
      perPage: 1,
      loop: true,
      controls: { prev: prevButton, next: nextButton },
    });

    assert.ok(state, 'state should be created when container markup is valid');
    assert.strictEqual(state.perPage, 1);
    assert.strictEqual(state.slides.length, 3);
    assert.ok(container.classList.contains('splide'));
    assert.ok(container.classList.contains('is-initialized'));
    assert.ok(container.classList.contains('is-active'));

    const trackDynamicClasses = Array.from(track.classList).filter((className) => className.startsWith('bvds-'));
    assert.ok(trackDynamicClasses.length >= 1, 'track should receive dynamic style classes');

    for (const slide of slides) {
      assert.ok(slide.classList.contains('splide__slide'));
      const dynamicClasses = Array.from(slide.classList).filter((className) => className.startsWith('bvds-'));
      assert.ok(dynamicClasses.length >= 1, 'slide should receive dynamic sizing styles');
    }

    assert.strictEqual(slides[0].getAttribute('aria-hidden'), 'false');
    assert.strictEqual(slides[1].getAttribute('aria-hidden'), 'true');
    assert.strictEqual(slides[2].getAttribute('aria-hidden'), 'true');

    state.goTo(2);
    assert.strictEqual(state.index, 2);
    assert.strictEqual(slides[2].getAttribute('aria-hidden'), 'false');
    assert.strictEqual(slides[0].getAttribute('aria-hidden'), 'true');

    destroyCarousel(state);
  });

  test('control buttons advance slides and respect looping', () => {
    const state = createCarousel(container, {
      perPage: 1,
      loop: true,
      controls: { prev: prevButton, next: nextButton },
    });

    nextButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, 1);
    nextButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, 2);
    nextButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, 0, 'looping should wrap forward navigation to the first slide');

    prevButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, 2, 'looping should wrap backward navigation to the last slide');

    destroyCarousel(state);
  });

  test('auto play progress resets when navigation occurs', () => {
    const state = createCarousel(container, {
      perPage: 1,
      controls: { prev: prevButton, next: nextButton },
    });
    const events = [];
    const progress = {
      reset: () => events.push('reset'),
      start: (duration) => events.push(['start', duration]),
      destroy: () => events.push('destroy'),
    };
    state.setProgress(progress);
    state.autoPlayInterval = 4200;

    state.goTo(1);
    assert.deepStrictEqual(events, ['reset', ['start', 4200]]);

    events.length = 0;
    state.goTo(2, { restartProgress: false });
    assert.deepStrictEqual(events, [], 'progress should not restart when restartProgress is false');

    destroyCarousel(state);
  });

  test('destroyCarousel tears down listeners and progress state', () => {
    const state = createCarousel(container, {
      perPage: 1,
      controls: { prev: prevButton, next: nextButton },
    });
    const progressEvents = [];
    const progress = {
      reset: () => progressEvents.push('reset'),
      start: () => progressEvents.push('start'),
      destroy: () => progressEvents.push('destroy'),
    };
    state.setProgress(progress);
    state.autoPlayInterval = 2000;
    state.goTo(1);

    destroyCarousel(state);
    assert.ok(progressEvents.includes('destroy'), 'progress.destroy should be called during teardown');
    assert.ok(!container.classList.contains('is-initialized'));
    assert.ok(!container.classList.contains('is-active'));
    assert.strictEqual(state.cleanup.length, 0);

    const previousIndex = state.index;
    nextButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, previousIndex, 'clicks after destroy should not change the index');
  });

  test('advanceSlide delegates to goTo with relative offsets', () => {
    const state = createCarousel(container, { perPage: 1 });
    const goToSpy = createSpy();
    state.goTo = goToSpy;
    state.index = 2;

    advanceSlide(state, -1, { restartProgress: false });
    assert.strictEqual(goToSpy.callCount, 1);
    assert.deepStrictEqual(goToSpy.calls[0], [1, { restartProgress: false }]);
  });
});


describe('progress bar', () => {
  let env;
  let container;

  beforeEach(() => {
    env = createBlogDomEnvironment(PROGRESS_HTML);
    container = env.document.getElementById('progress-root');
    env.inlineStyleGuard.guard(container);
  });

  afterEach(() => {
    env.cleanup();
  });

  test('mountProgressBar renders structure with dynamic width styles', () => {
    const progress = mountProgressBar(container, { initialDuration: 500, autoStart: false });
    assert.ok(progress, 'progress instance should be returned');

    const wrapper = container.querySelector('.splide__progress');
    assert.ok(wrapper, 'wrapper element should be appended');
    const fill = wrapper.querySelector('.splide__progress__bar');
    assert.ok(fill, 'fill element should be created');

    progress.reset();
    const cssRules = readDynamicStyleRules(env.document);
    assert.match(cssRules, /width:\s*0%/);
  });

  test('autoStart runs animation and triggers completion callback', () => {
    const onComplete = createSpy();
    const progress = mountProgressBar(container, { initialDuration: 600, autoStart: true, onComplete });
    const wrapper = progress.element;
    const fill = wrapper.querySelector('.splide__progress__bar');
    assert.ok(Array.from(fill.classList).some((className) => className.startsWith('bvds-')));

    env.raf.step(0);
    env.raf.step(300);
    assert.strictEqual(onComplete.callCount, 0);

    env.raf.step(300);
    assert.strictEqual(onComplete.callCount, 1);

    const cssRules = readDynamicStyleRules(env.document);
    assert.match(cssRules, /width:\s*100%/);
  });

  test('manual controls support stop, restart, and cleanup', () => {
    const onComplete = createSpy();
    const progress = mountProgressBar(container, { initialDuration: 800, onComplete });

    progress.start(800);
    env.raf.step(0);
    env.raf.step(400);
    progress.stop();
    env.raf.step(600);
    assert.strictEqual(onComplete.callCount, 0, 'stop should cancel pending completion');

    progress.setOnComplete(onComplete);
    progress.start(0);
    assert.strictEqual(onComplete.callCount, 1, 'zero duration should fire completion immediately');

    progress.destroy();
    assert.strictEqual(container.children.length, 0, 'destroy should remove wrapper from DOM');
  });
});
