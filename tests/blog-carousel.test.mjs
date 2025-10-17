import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, test } from 'node:test';

import { advanceSlide, createCarousel, destroyCarousel } from '../js/blog/carousel.js';
import { mountProgressBar } from '../js/blog/progressBar.js';
import { createBlogDomEnvironment, createSpy } from './test-helpers/blog-dom.mjs';

function assertHasClasses(element, classes, messagePrefix = 'element') {
  classes.forEach((className) => {
    assert.ok(
      element.classList.contains(className),
      `${messagePrefix} should include the “${className}” class`,
    );
  });
}

function assertNoInlineStyleAttributes(elements, messagePrefix = 'element') {
  elements.forEach((element, index) => {
    assert.ok(element, `${messagePrefix} at index ${index} should exist`);
    assert.strictEqual(
      element.hasAttribute('style'),
      false,
      `${messagePrefix} at index ${index} should not set inline style attributes`,
    );
  });
}

const CAROUSEL_HTML = `
  <section class="blog-carousel" data-carousel>
    <div data-carousel-viewport>
      <ul data-carousel-track>
        <li data-carousel-slide>Slide 1</li>
        <li data-carousel-slide>Slide 2</li>
        <li data-carousel-slide>Slide 3</li>
      </ul>
    </div>
    <button type="button" data-carousel-prev>Prev</button>
    <button type="button" data-carousel-next>Next</button>
  </section>
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

  test('initializes slides with data attributes and accessibility state', () => {
    const state = createCarousel(container, {
      perPage: 1,
      loop: true,
      controls: { prev: prevButton, next: nextButton },
    });

    assert.ok(state, 'state should be created when container markup is valid');
    assert.strictEqual(state.perPage, 1);
    assert.strictEqual(state.slides.length, 3);
    assert.strictEqual(state.pageCount, 3);

    assert.strictEqual(container.dataset.index, '0');
    assert.strictEqual(container.dataset.perPage, '1');
    assert.strictEqual(container.dataset.count, '3');
    assert.strictEqual(container.dataset.state, 'active');
    assert.strictEqual(track.dataset.transition, 'auto');

    assertNoInlineStyleAttributes([container, track, ...slides], 'carousel element');

    slides.forEach((slide, index) => {
      assert.strictEqual(slide.dataset.index, String(index));
      assert.strictEqual(slide.dataset.active, index === 0 ? 'true' : 'false');
      assert.strictEqual(slide.dataset.inert, index === 0 ? 'false' : 'true');
      assert.strictEqual(slide.getAttribute('aria-hidden'), index === 0 ? 'false' : 'true');
    });

    state.goTo(2);
    assert.strictEqual(state.index, 2);
    assert.strictEqual(container.dataset.index, '2');
    assert.strictEqual(slides[2].dataset.active, 'true');
    assert.strictEqual(slides[0].dataset.active, 'false');
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

    assertNoInlineStyleAttributes([container, track, ...slides], 'carousel element');

    const previousIndex = state.index;
    nextButton.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(state.index, previousIndex, 'clicks after destroy should not change the index');
    assert.strictEqual(container.dataset.index, undefined);
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

  test('mountProgressBar renders semantic progress meter without style injection', () => {
    const progress = mountProgressBar(container, { initialDuration: 500, autoStart: false });
    assert.ok(progress, 'progress instance should be returned');

    const wrapper = container.querySelector('.blog-carousel__progress');
    assert.ok(wrapper, 'wrapper element should be appended');
    assertHasClasses(wrapper, ['blog-carousel__progress', 'blog-progress', 'mt-2'], 'progress wrapper');
    assert.strictEqual(wrapper.dataset.carouselProgress, 'true');
    assert.strictEqual(wrapper.getAttribute('data-carousel-progress'), 'true');
    const meter = wrapper.querySelector('progress.progress--blog');
    assert.ok(meter, 'progress meter should be created');
    assertHasClasses(meter, ['progress', 'progress--blog'], 'progress meter');
    assert.strictEqual(meter.max, 100, 'progress meter should expose a 0-100 range');
    assert.strictEqual(meter.value, 0, 'progress meter should start at zero');
    assert.strictEqual(meter.dataset.state, 'idle');
    assert.strictEqual(wrapper.dataset.state, 'idle');
    assert.strictEqual(meter.dataset.progress, '0');
    assert.strictEqual(
      meter.getAttribute('aria-valuetext'),
      'Carousel progress 0% complete',
      'progress meter should emit accessible status text',
    );
    assert.strictEqual(meter.getAttribute('data-progress-meter'), 'true');
    assert.strictEqual(meter.dataset.progressMeter, 'true');
    assert.strictEqual(meter.getAttribute('data-variant'), 'blog');

    progress.reset();

    assertNoInlineStyleAttributes([container, wrapper, meter], 'progress element');
  });

  test('autoStart runs animation and triggers completion callback', () => {
    const onComplete = createSpy();
    const progress = mountProgressBar(container, { initialDuration: 600, autoStart: true, onComplete });
    const wrapper = progress.element;
    const meter = wrapper.querySelector('progress.progress--blog');
    assert.ok(meter, 'progress meter should exist when autoStart is enabled');

    assertNoInlineStyleAttributes([container, wrapper, meter], 'progress element');

    env.raf.step(0);
    env.raf.step(300);
    assert.strictEqual(onComplete.callCount, 0);
    assert.ok(meter.value > 0 && meter.value < 100, 'meter should report intermediate progress');
    assert.strictEqual(meter.dataset.state, 'active');

    env.raf.step(300);
    assert.strictEqual(onComplete.callCount, 1);
    assert.strictEqual(meter.value, 100);
    assert.strictEqual(meter.dataset.state, 'complete');
    assert.strictEqual(meter.dataset.progress, '100');
  });

  test('manual controls support stop, restart, and cleanup', () => {
    const onComplete = createSpy();
    const progress = mountProgressBar(container, { initialDuration: 800, onComplete });
    const meter = progress.element.querySelector('progress.progress--blog');

    progress.start(800);
    env.raf.step(0);
    env.raf.step(400);
    assert.strictEqual(meter.value, 50, 'halfway through should yield a 50% reading');
    assert.strictEqual(meter.dataset.state, 'active');

    progress.stop();
    assert.strictEqual(meter.dataset.state, 'paused');
    const pausedValue = meter.value;

    env.raf.step(600);
    assert.strictEqual(meter.value, pausedValue, 'progress should not advance after stop');
    assert.strictEqual(onComplete.callCount, 0, 'stop should cancel pending completion');

    progress.setOnComplete(onComplete);
    progress.start(0);
    assert.strictEqual(onComplete.callCount, 1, 'zero duration should fire completion immediately');
    assert.strictEqual(meter.value, 100);
    assert.strictEqual(meter.dataset.state, 'complete');

    progress.destroy();
    assert.strictEqual(container.children.length, 0, 'destroy should remove wrapper from DOM');
    assert.strictEqual(
      container.querySelector('[data-carousel-progress]'),
      null,
      'destroy should remove declarative progress markup',
    );
    assertNoInlineStyleAttributes([container], 'progress container');
  });
});
