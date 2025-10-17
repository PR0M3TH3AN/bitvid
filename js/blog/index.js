import { createCarousel, advanceSlide, destroyCarousel } from './carousel.js';
import { mountProgressBar } from './progressBar.js';
import { initZapthreadsEmbed as defaultInitZapthreadsEmbed } from './zapthreadsEmbed.js';
import { userLogger } from "../utils/logger.js";

const CAROUSEL_AUTOPLAY_INTERVAL = 8000;

function repeatParagraph(text, times) {
  return Array.from({ length: times }, () => text).join(' ');
}

const NOTE_BLUEPRINTS = [
  {
    id: 'relay-health-q3',
    title: 'Relay health checks land in bitvid',
    paragraph:
      'We reduced fallback churn by folding relay health signals directly into playback orchestration, keeping viewers pinned to the fastest source while magnets warm in the background.',
    repeats: 9,
    createdAt: Date.parse('2024-08-14T09:00:00Z') / 1000,
    image: './assets/png/bitvid-banner.png',
    topics: ['infrastructure', 'release'],
  },
  {
    id: 'nostr-tooling-upgrade',
    title: 'Tooling overhaul simplifies Nostr publishing',
    paragraph:
      'We rebuilt the publishing helpers so creators can author video and audio notes with cleaner defaults, automatic metadata validation, and better local previews before signing.',
    repeats: 8,
    createdAt: Date.parse('2024-07-02T15:30:00Z') / 1000,
    image: './assets/png/bitvid-banner.png',
    topics: ['creator', 'tooling'],
  },
  {
    id: 'zapthreads-updates',
    title: 'Zapthreads embeds now hydrate instantly',
    paragraph:
      'Comment embeds now stream profile cards and replies incrementally, so community conversations appear without waiting for full thread reconciliation across relays.',
    repeats: 8,
    createdAt: Date.parse('2024-06-18T18:45:00Z') / 1000,
    topics: ['community', 'release'],
  },
  {
    id: 'progressive-download',
    title: 'Progressive download prioritises hosted sources',
    paragraph:
      'Playback prefers direct HTTP sources with smoother resume support while still preparing magnet fallbacks, unlocking faster start times for mobile viewers on congested relays.',
    repeats: 7,
    createdAt: Date.parse('2024-05-09T12:00:00Z') / 1000,
    topics: ['playback'],
  },
  {
    id: 'moderation-tooling',
    title: 'Moderation tooling gains topic level controls',
    paragraph:
      'Admin teams can now enforce topic-specific guidelines with clearer override reporting, making it easier to surface community playlists without compromising safety.',
    repeats: 7,
    createdAt: Date.parse('2024-04-21T20:15:00Z') / 1000,
    topics: ['moderation', 'community'],
  },
  {
    id: 'mobile-ux-refresh',
    title: 'Mobile UX refresh ships across the blog',
    paragraph:
      'We tuned typography, spacing, and gesture targets throughout the blog so updates remain readable on small screens while matching the main app aesthetic.',
    repeats: 6,
    createdAt: Date.parse('2024-03-05T10:00:00Z') / 1000,
    topics: ['design'],
  },
];

function buildDefaultNotes() {
  return NOTE_BLUEPRINTS.map((entry) => ({
    ...entry,
    summary: repeatParagraph(entry.paragraph, entry.repeats),
  }));
}

function readMetaValue(name) {
  const element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    return '';
  }
  const value = element.getAttribute('value');
  return value == null ? '' : value;
}

function parseNumber(value, fallback = 0) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseTopics(value) {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(',')
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}

function readBlogConfig() {
  return {
    npub: readMetaValue('author'),
    relays: readMetaValue('relays')
      .split(',')
      .map((relay) => relay.trim())
      .filter((relay) => relay.length > 0),
    topNotes: parseNumber(readMetaValue('top-notes'), 0),
    shortNotesMode: readMetaValue('short-notes'),
    shortNotesMinChars: parseNumber(readMetaValue('short-notes-min-chars'), 0),
    shortFeedSummaryMaxChars: parseNumber(
      readMetaValue('short-notes-summary-max-chars'),
      0,
    ),
    topics: parseTopics(readMetaValue('topics')),
    commentsEnabled: readMetaValue('comments').toLowerCase() === 'yes',
  };
}

function resolveNotes() {
  if (typeof window !== 'undefined' && Array.isArray(window.bitvidBlogNotes)) {
    return window.bitvidBlogNotes;
  }
  return buildDefaultNotes();
}

function setupEmbedHeightBroadcast({ root, registerCleanup }) {
  if (typeof window === 'undefined' || window.parent === window) {
    return;
  }

  const element = root || document.querySelector('.blog-app-root');
  if (!element) {
    return;
  }

  const parentOrigin = (() => {
    try {
      if (document.referrer) {
        return new URL(document.referrer).origin;
      }
    } catch (error) {
      userLogger.error('[blog] failed to parse parent origin for resize messaging', error);
    }
    return '*';
  })();

  let lastHeight = null;
  let pendingFrame = null;

  const measureAndPost = (force = false) => {
    const rect = element.getBoundingClientRect();
    const height = Math.max(0, Math.ceil(rect.height));
    if (!Number.isFinite(height)) {
      return;
    }
    if (!force && height === lastHeight) {
      return;
    }
    lastHeight = height;
    try {
      window.parent.postMessage({ type: 'bitvid-blog-resize', height }, parentOrigin);
    } catch (error) {
      userLogger.error('[blog] failed to post resize message', error);
    }
  };

  const queueMeasurement = (force = false) => {
    if (force) {
      measureAndPost(true);
      return;
    }
    if (pendingFrame != null) {
      return;
    }
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = null;
      measureAndPost(false);
    });
  };

  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = null;
    measureAndPost(true);
  });

  registerCleanup(() => {
    if (pendingFrame != null) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
  });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      queueMeasurement();
    });
    observer.observe(element);
    registerCleanup(() => {
      observer.disconnect();
    });
  } else {
    const intervalId = window.setInterval(() => {
      queueMeasurement();
    }, 500);
    registerCleanup(() => {
      window.clearInterval(intervalId);
    });
  }

  const handleMessage = (event) => {
    if (event.source !== window.parent) {
      return;
    }
    if (parentOrigin !== '*' && event.origin !== parentOrigin) {
      return;
    }
    if (event?.data?.type === 'bitvid-blog-request-height') {
      queueMeasurement(true);
    }
  };

  window.addEventListener('message', handleMessage);
  registerCleanup(() => {
    window.removeEventListener('message', handleMessage);
  });

  const handleLoad = () => {
    queueMeasurement(true);
  };
  window.addEventListener('load', handleLoad, { once: true });
  registerCleanup(() => {
    window.removeEventListener('load', handleLoad);
  });
}

function formatDate(unixSeconds, { includeTime = false } = {}) {
  if (!unixSeconds) {
    return '';
  }
  const date = new Date(unixSeconds * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let formatted = `${lookup.day ?? ''} ${lookup.month ?? ''} ${lookup.year ?? ''}`.trim();

  if (includeTime) {
    const time = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    formatted = `${formatted} - ${time}`;
  }

  return formatted;
}

function truncate(text, limit) {
  if (!limit || typeof text !== 'string' || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit).trim()}…`;
}
function createTopicsNav(topics) {
  const nav = document.createElement('nav');
  nav.className = 'flex flex-wrap gap-2';

  const label = document.createElement('span');
  label.className = 'text-sm font-semibold uppercase tracking-wide text-blog-gray-400';
  label.textContent = 'Topics';
  nav.appendChild(label);

  topics.forEach((topic) => {
    const pill = document.createElement('span');
    pill.className =
      'rounded-full border border-blog-neutral-200 px-3 py-1 text-sm text-blog-gray-600 dark:border-blog-neutral-700 dark:text-blog-gray-200';
    pill.textContent = topic;
    nav.appendChild(pill);
  });

  return nav;
}

function renderTopNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'top-notes';

  notes.forEach((note) => {
    const noteContainer = document.createElement('article');
    noteContainer.className = 'note';

    const link = document.createElement('a');
    link.href = `#${note.id}`;
    link.className = 'flex flex-col gap-3';

    if (note.image) {
      const image = document.createElement('img');
      image.alt = note.title;
      image.loading = 'lazy';
      image.src = note.image;
      link.appendChild(image);
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = note.title;
    link.appendChild(title);

    if (note.summary) {
      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.textContent = truncate(note.summary, 320);
      link.appendChild(summary);
    }

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = formatDate(note.createdAt);
    link.appendChild(date);

    noteContainer.appendChild(link);
    section.appendChild(noteContainer);
  });

  return section;
}

function createArrowButton(direction) {
  const button = document.createElement('button');
  button.type = 'button';
  const sideClass =
    direction === 'next'
      ? 'right-0 translate-x-1/2'
      : 'left-0 -translate-x-1/2';
  button.className = `blog-carousel__control pointer-events-auto absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-blog-neutral-200 bg-white/80 text-xl text-blog-gray-500 shadow-sm transition hover:text-blog-purple dark:border-blog-neutral-700 dark:bg-blog-neutral-900/80 dark:text-blog-gray-200 ${sideClass}`;
  button.setAttribute('aria-label', direction === 'next' ? 'Next slide' : 'Previous slide');
  button.setAttribute('data-carousel-control', direction);
  if (direction === 'next') {
    button.setAttribute('data-carousel-next', 'true');
  } else {
    button.setAttribute('data-carousel-prev', 'true');
  }
  button.textContent = direction === 'next' ? '›' : '‹';
  return button;
}

function renderShortNotesCarousel(notes, config) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'short-notes blog-carousel relative flex flex-col gap-4';
  section.setAttribute('data-carousel', 'true');

  const heading = document.createElement('h2');
  heading.className = 'text-2xl font-semibold text-blog-gray-800 dark:text-blog-gray-100';
  heading.textContent = 'Short notes';
  section.appendChild(heading);

  const viewport = document.createElement('div');
  viewport.className = 'blog-carousel__viewport relative overflow-hidden';
  viewport.setAttribute('data-carousel-viewport', 'true');
  section.appendChild(viewport);

  const list = document.createElement('ul');
  list.className = 'blog-carousel__track';
  list.setAttribute('data-carousel-track', 'true');
  viewport.appendChild(list);

  const perPage = Math.min(notes.length, 3);
  const summariesLimit = config.shortFeedSummaryMaxChars || 300;

  notes.forEach((note) => {
    const item = document.createElement('li');
    item.className =
      'blog-carousel__slide flex flex-col gap-2 rounded-lg bg-blog-neutral-50 p-4 transition-colors dark:bg-blog-neutral-900';
    item.setAttribute('data-carousel-slide', 'true');

    const link = document.createElement('a');
    link.href = `#${note.id}`;
    link.className = 'flex flex-col gap-2 text-blog-gray-700 hover:text-blog-purple dark:text-blog-gray-50';

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = formatDate(note.createdAt, { includeTime: true });
    link.appendChild(date);

    const summary = document.createElement('p');
    summary.className = 'leading-relaxed';
    summary.textContent = truncate(note.summary, summariesLimit);
    link.appendChild(summary);

    item.appendChild(link);
    list.appendChild(item);
  });

  const prev = createArrowButton('prev');
  const next = createArrowButton('next');
  viewport.appendChild(prev);
  viewport.appendChild(next);

  const carousel = createCarousel(section, {
    track: list,
    slides: Array.from(list.children),
    perPage,
    loop: notes.length > perPage,
    autoPlayInterval: CAROUSEL_AUTOPLAY_INTERVAL,
    controls: { prev, next },
  });

  if (!carousel) {
    return { section, carousel: null };
  }

  const progress = mountProgressBar(section, {
    initialDuration: CAROUSEL_AUTOPLAY_INTERVAL,
    autoStart: false,
  });

  if (progress) {
    progress.setOnComplete(() => {
      advanceSlide(carousel, 1, { restartProgress: true });
    });

    carousel.setProgress(progress);
    if (carousel.autoPlayInterval > 0) {
      progress.reset();
      progress.start(carousel.autoPlayInterval);
    }
  }

  return { section, carousel, progress: progress || null };
}

function renderShortNotesList(notes, config) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'short-notes flex flex-col gap-4';

  const heading = document.createElement('h2');
  heading.className = 'text-2xl font-semibold text-blog-gray-800 dark:text-blog-gray-100';
  heading.textContent = 'Short notes';
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'flex flex-col gap-4';

  const summariesLimit = config.shortFeedSummaryMaxChars || 280;

  notes.forEach((note) => {
    const item = document.createElement('li');
    item.className = 'rounded-lg border border-blog-neutral-200 p-4 dark:border-blog-neutral-800';

    const link = document.createElement('a');
    link.href = `#${note.id}`;
    link.className = 'flex flex-col gap-2 text-blog-gray-700 hover:text-blog-purple dark:text-blog-gray-50';

    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = formatDate(note.createdAt, { includeTime: true });
    link.appendChild(date);

    const summary = document.createElement('p');
    summary.className = 'leading-relaxed';
    summary.textContent = truncate(note.summary, summariesLimit);
    link.appendChild(summary);

    item.appendChild(link);
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}
function renderMainFeed(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const section = document.createElement('section');
  section.className = 'flex flex-col gap-10';

  notes.forEach((note) => {
    const article = document.createElement('article');
    article.id = note.id;
    article.className =
      'flex scroll-mt-24 flex-col gap-4 border-b border-blog-neutral-200 pb-8 last:border-b-0 dark:border-blog-neutral-800';

    const header = document.createElement('header');
    header.className = 'flex flex-col gap-2';

    const title = document.createElement('h2');
    title.className = 'text-3xl font-semibold text-blog-gray-900 dark:text-blog-gray-100';
    title.textContent = note.title;
    header.appendChild(title);

    const date = document.createElement('div');
    date.className = 'text-sm text-blog-gray-400';
    date.textContent = formatDate(note.createdAt, { includeTime: true });
    header.appendChild(date);

    if (Array.isArray(note.topics) && note.topics.length > 0) {
      const tags = document.createElement('ul');
      tags.className = 'flex flex-wrap gap-2';
      note.topics.forEach((topic) => {
        const tag = document.createElement('li');
        tag.className = 'rounded-full bg-blog-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blog-gray-500 dark:bg-blog-neutral-900 dark:text-blog-gray-300';
        tag.textContent = topic;
        tags.appendChild(tag);
      });
      header.appendChild(tags);
    }

    article.appendChild(header);

    if (note.image) {
      const figure = document.createElement('figure');
      figure.className = 'overflow-hidden rounded-lg';
      const image = document.createElement('img');
      image.src = note.image;
      image.alt = note.title;
      image.loading = 'lazy';
      figure.appendChild(image);
      article.appendChild(figure);
    }

    if (note.summary) {
      const body = document.createElement('p');
      body.className = 'text-lg leading-relaxed text-blog-gray-700 dark:text-blog-gray-200';
      body.textContent = note.summary;
      article.appendChild(body);
    }

    section.appendChild(article);
  });

  return section;
}

function extractZapthreadsOptions(element) {
  const attributeMap = [
    ['anchor', 'anchor'],
    ['title', 'title'],
    ['disable', 'disable'],
    ['urls', 'urls'],
    ['reply-placeholder', 'replyPlaceholder'],
    ['legacy-url', 'legacyUrl'],
  ];

  const options = {};
  attributeMap.forEach(([attr, key]) => {
    const value = element.getAttribute(attr);
    if (value === null) {
      return;
    }
    if (key === 'legacyUrl') {
      options[key] = value !== 'false';
    } else {
      options[key] = value;
    }
  });
  return options;
}

function initializeZapthreads({ registerCleanup, isDestroyed, initZapthreadsEmbed }) {
  if (typeof initZapthreadsEmbed !== 'function') {
    return;
  }
  const elements = document.querySelectorAll('zap-threads');
  if (!elements.length) {
    return;
  }

  elements.forEach((element) => {
    const options = extractZapthreadsOptions(element);
    try {
      const maybeDispose = initZapthreadsEmbed({ root: element, options });
      if (!maybeDispose) {
        return;
      }

      if (typeof maybeDispose.then === 'function') {
        maybeDispose
          .then((dispose) => {
            if (typeof dispose !== 'function') {
              return;
            }
            if (isDestroyed()) {
              try {
                dispose();
              } catch (error) {
                userLogger.error('[blog] zapthreads cleanup failed', error);
              }
              return;
            }
            registerCleanup(() => {
              try {
                dispose();
              } catch (error) {
                userLogger.error('[blog] zapthreads cleanup failed', error);
              }
            });
          })
          .catch((error) => {
            userLogger.error('[blog] failed to initialise zapthreads embed', error);
          });
        return;
      }

      if (typeof maybeDispose === 'function') {
        if (isDestroyed()) {
          try {
            maybeDispose();
          } catch (error) {
            userLogger.error('[blog] zapthreads cleanup failed', error);
          }
          return;
        }
        registerCleanup(() => {
          try {
            maybeDispose();
          } catch (error) {
            userLogger.error('[blog] zapthreads cleanup failed', error);
          }
        });
      }
    } catch (error) {
      userLogger.error('[blog] failed to start zapthreads embed', error);
    }
  });
}

function mountBlogApp({ initZapthreadsEmbed = defaultInitZapthreadsEmbed } = {}) {
  const runtime = {
    destroyed: false,
    cleanupCallbacks: new Set(),
    sliderStates: new Map(),
  };

  const registerCleanup = (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }
    if (runtime.destroyed) {
      try {
        callback();
      } catch (error) {
        userLogger.error('[blog] cleanup callback failed', error);
      }
      return () => {};
    }
    runtime.cleanupCallbacks.add(callback);
    return () => {
      runtime.cleanupCallbacks.delete(callback);
    };
  };

  const destroy = () => {
    if (runtime.destroyed) {
      return;
    }
    runtime.destroyed = true;
    runtime.cleanupCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        userLogger.error('[blog] cleanup callback failed', error);
      }
    });
    runtime.cleanupCallbacks.clear();
    runtime.sliderStates.clear();
  };

  const root = document.querySelector('.blog-app-root');
  if (!root) {
    return destroy;
  }

  const config = readBlogConfig();
  const notes = resolveNotes().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const hero = document.createElement('header');
  hero.className = 'flex flex-col gap-4';

  const heading = document.createElement('h1');
  heading.className = 'text-4xl font-bold text-blog-gray-900 dark:text-blog-gray-100';
  heading.textContent = 'bitvid updates';
  hero.appendChild(heading);

  const subheading = document.createElement('p');
  subheading.className = 'max-w-2xl text-lg text-blog-gray-600 dark:text-blog-gray-300';
  subheading.textContent =
    'Shipping notes and release highlights from the decentralized video network. Expect incremental drops, roadmap checkpoints, and moderation changelogs.';
  hero.appendChild(subheading);

  if (config.topics.length > 0) {
    hero.appendChild(createTopicsNav(config.topics));
  }

  const main = document.createElement('main');
  main.className = 'mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 scroll-pt-24';
  main.appendChild(hero);

  const topNotes = config.topNotes > 0 ? notes.slice(0, config.topNotes) : [];
  if (topNotes.length > 0) {
    const topSection = renderTopNotes(topNotes);
    if (topSection) {
      main.appendChild(topSection);
    }
  }

  const remaining = config.topNotes > 0 ? notes.slice(config.topNotes) : notes;
  const shortNotesCandidates = remaining.filter((note) => {
    const length = typeof note.summary === 'string' ? note.summary.length : 0;
    return length >= config.shortNotesMinChars;
  });

  const registerSlider = (section, { carousel, progress }) => {
    if (!section || !carousel) {
      return;
    }

    const sliderState = {
      container: section,
      carousel,
      progress,
      pausedByPointer: false,
      pausedByVisibility: document.visibilityState === 'hidden',
    };

    runtime.sliderStates.set(section, sliderState);

    const pause = () => {
      if (sliderState.progress && typeof sliderState.progress.stop === 'function') {
        sliderState.progress.stop();
      }
    };

    const resume = () => {
      if (!sliderState.progress || typeof sliderState.progress.start !== 'function') {
        return;
      }
      if (sliderState.carousel.autoPlayInterval <= 0) {
        return;
      }
      sliderState.progress.reset?.();
      sliderState.progress.start(sliderState.carousel.autoPlayInterval);
    };

    const updatePlayback = () => {
      if (sliderState.pausedByPointer || sliderState.pausedByVisibility) {
        pause();
        return;
      }
      resume();
    };

    const handlePointerEnter = () => {
      sliderState.pausedByPointer = true;
      pause();
    };

    const handlePointerLeave = () => {
      sliderState.pausedByPointer = false;
      updatePlayback();
    };

    section.addEventListener('pointerenter', handlePointerEnter);
    section.addEventListener('pointerleave', handlePointerLeave);
    registerCleanup(() => {
      section.removeEventListener('pointerenter', handlePointerEnter);
      section.removeEventListener('pointerleave', handlePointerLeave);
    });

    const handleVisibilityChange = () => {
      sliderState.pausedByVisibility = document.visibilityState === 'hidden';
      updatePlayback();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    registerCleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    if (sliderState.pausedByVisibility) {
      pause();
    }

    registerCleanup(() => {
      runtime.sliderStates.delete(section);
      destroyCarousel(sliderState.carousel);
    });
  };

  if (config.shortNotesMode === 'carousel') {
    const rendered = renderShortNotesCarousel(shortNotesCandidates, config);
    if (rendered?.section) {
      main.appendChild(rendered.section);
      if (rendered.carousel) {
        registerSlider(rendered.section, rendered);
      }
    }
  } else if (config.shortNotesMode === 'main') {
    const shortNotesSection = renderShortNotesList(shortNotesCandidates, config);
    if (shortNotesSection) {
      main.appendChild(shortNotesSection);
    }
  }

  const feed = renderMainFeed(remaining);
  if (feed) {
    main.appendChild(feed);
  }

  root.replaceChildren(main);
  setupEmbedHeightBroadcast({ root, registerCleanup });

  registerCleanup(() => {
    root.replaceChildren();
  });

  initializeZapthreads({
    registerCleanup,
    isDestroyed: () => runtime.destroyed,
    initZapthreadsEmbed,
  });

  return destroy;
}

let activeTeardown = null;

export function bootstrapBlog(options = {}) {
  if (typeof activeTeardown === 'function') {
    activeTeardown();
  }
  const destroy = mountBlogApp(options);
  activeTeardown = () => {
    destroy();
    activeTeardown = null;
  };
  return activeTeardown;
}

export function teardownBlog() {
  if (typeof activeTeardown === 'function') {
    activeTeardown();
  }
}

