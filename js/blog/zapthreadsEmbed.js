/**
 * DOM helpers for constructing Zapthreads embed structures without relying on the
 * compiled Svelte runtime helpers that appear in blog.html.
 */

function createSvg(pathD, { viewBox, className } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (viewBox) {
    svg.setAttribute('viewBox', viewBox);
  }
  if (className) {
    svg.setAttribute('class', className);
  }

  if (pathD) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
  }

  return svg;
}

export function createZapthreadsCommentInfoPicture() {
  const container = document.createElement('div');
  container.className = 'ztr-comment-info-picture';

  const image = document.createElement('img');
  container.appendChild(image);

  return container;
}

export function createZapthreadsReplyForm() {
  const form = document.createElement('div');
  form.className = 'ztr-reply-form';

  const textarea = document.createElement('textarea');
  form.appendChild(textarea);

  const controls = document.createElement('div');
  controls.className = 'ztr-reply-controls';
  form.appendChild(controls);

  return form;
}

export function createZapthreadsPublishingDisabledMessage() {
  const span = document.createElement('span');
  span.textContent = 'Publishing is disabled';
  return span;
}

export function createZapthreadsReplyErrorMessage() {
  const span = document.createElement('span');
  span.className = 'ztr-reply-error';
  span.textContent = 'Error: ';
  return span;
}

export function createZapthreadsSpinner() {
  const svg = createSvg(null, {
    viewBox: '0 0 50 50',
    className: 'ztr-spinner',
  });

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'path');
  circle.setAttribute('cx', '25');
  circle.setAttribute('cy', '25');
  circle.setAttribute('r', '20');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke-width', '5');
  svg.appendChild(circle);

  return svg;
}

export function createZapthreadsReplyAsButton() {
  const button = document.createElement('button');
  button.className = 'ztr-reply-button';
  button.textContent = 'Reply as ';
  return button;
}

export function createZapthreadsReplyAnonymouslyButton() {
  const button = document.createElement('button');
  button.className = 'ztr-reply-button';
  button.textContent = 'Reply anonymously';
  return button;
}

export function createZapthreadsReplyLoginButton() {
  const button = document.createElement('button');
  button.className = 'ztr-reply-login-button';
  button.textContent = 'Log in';
  return button;
}

export function createZapthreadsLikeAction() {
  const item = document.createElement('li');
  item.className = 'ztr-comment-action-like';

  const span = document.createElement('span');
  span.textContent = ' likes';
  item.appendChild(span);

  return item;
}

export function createZapthreadsZapAction() {
  const item = document.createElement('li');
  item.className = 'ztr-comment-action-zap';

  const span = document.createElement('span');
  span.textContent = ' sats';
  item.appendChild(span);

  return item;
}

export function createZapthreadsNewCommentContainer() {
  const wrapper = document.createElement('div');
  wrapper.className = 'ztr-comment-new';

  const body = document.createElement('div');
  body.className = 'ztr-comment-body';
  wrapper.appendChild(body);

  const actions = document.createElement('ul');
  actions.className = 'ztr-comment-actions';
  body.appendChild(actions);

  return wrapper;
}

export function createZapthreadsThreadContainer() {
  const div = document.createElement('div');
  div.className = 'ztr-thread';
  return div;
}

export function createZapthreadsReplyActionItem() {
  const item = document.createElement('li');
  item.className = 'ztr-comment-action-reply';

  const span = document.createElement('span');
  item.appendChild(span);

  return item;
}

export function createZapthreadsCommentContainer() {
  const root = document.createElement('div');
  root.className = 'ztr-comment';

  const body = document.createElement('div');
  body.className = 'ztr-comment-body';
  root.appendChild(body);

  const infoWrapper = document.createElement('div');
  infoWrapper.className = 'ztr-comment-info-wrapper';
  body.appendChild(infoWrapper);

  const info = document.createElement('div');
  info.className = 'ztr-comment-info';
  infoWrapper.appendChild(info);

  info.appendChild(createZapthreadsCommentInfoPicture());

  const infoItems = document.createElement('ul');
  infoItems.className = 'ztr-comment-info-items';
  info.appendChild(infoItems);

  const authorItem = document.createElement('li');
  authorItem.className = 'ztr-comment-info-author';
  infoItems.appendChild(authorItem);

  const authorLink = document.createElement('a');
  authorLink.target = '_blank';
  authorItem.appendChild(authorLink);

  const nowrap = document.createElement('span');
  nowrap.className = 'ztr-nowrap';
  const strong = document.createElement('strong');
  strong.textContent = ' <!>ed';
  nowrap.appendChild(strong);
  nowrap.appendChild(document.createTextNode(' '));
  authorItem.appendChild(nowrap);

  const dotsItem = document.createElement('li');
  infoItems.appendChild(dotsItem);
  const dotsLink = document.createElement('a');
  dotsLink.className = 'ztr-comment-info-dots';
  dotsItem.appendChild(dotsLink);

  const metaList = document.createElement('ul');
  metaList.className = 'ztr-comment-info-items';
  infoWrapper.appendChild(metaList);

  const truncatedText = document.createElement('div');
  truncatedText.className = 'ztr-comment-text';
  body.appendChild(truncatedText);

  const fullText = document.createElement('div');
  fullText.className = 'ztr-comment-text';
  body.appendChild(fullText);

  const actions = document.createElement('ul');
  actions.className = 'ztr-comment-actions';
  body.appendChild(actions);

  return root;
}

export function createZapthreadsBulletSeparator() {
  const item = document.createElement('li');
  item.textContent = '●';
  return item;
}

export function createZapthreadsRepliesLabel() {
  const item = document.createElement('li');
  item.textContent = ' repl';
  return item;
}

export function createZapthreadsActionCountItem() {
  const item = document.createElement('li');
  const span = document.createElement('span');
  item.appendChild(span);
  return item;
}

export function createZapthreadsInfoPane() {
  const container = document.createElement('div');
  container.className = 'ztr-info-pane';

  const link = document.createElement('a');
  link.target = '_blank';
  container.appendChild(link);

  const small = document.createElement('small');
  small.textContent = 'Event data';
  link.appendChild(small);

  return container;
}

export function createZapthreadsCrossPostWarning() {
  const paragraph = document.createElement('p');
  paragraph.className = 'warning';

  const span = document.createElement('span');
  span.textContent = 'This is a <!> that referenced this article in ';
  paragraph.appendChild(span);

  const link = document.createElement('a');
  link.textContent = 'another thread';
  span.appendChild(link);

  return paragraph;
}

export function createZapthreadsContentMaybeChangedWarning() {
  const paragraph = document.createElement('p');
  paragraph.className = 'warning';

  const span = document.createElement('span');
  span.textContent = 'Article contents may have changed since this <!> was made';
  paragraph.appendChild(span);

  return paragraph;
}

export function createZapthreadsContentChangedWarning() {
  const paragraph = document.createElement('p');
  paragraph.className = 'warning';

  const span = document.createElement('span');
  span.textContent = 'Article contents changed since this <!> was made';
  paragraph.appendChild(span);

  return paragraph;
}

export function createZapthreadsCommentExpand() {
  const container = document.createElement('div');
  container.className = 'ztr-comment-expand';

  const link = document.createElement('a');
  container.appendChild(link);

  const span = document.createElement('span');
  span.textContent = 'Show full comment';
  container.appendChild(span);

  return container;
}

export function createZapthreadsRepliesContainer() {
  const container = document.createElement('div');
  container.className = 'ztr-comment-replies';
  return container;
}

export function createZapthreadsMessageIcon() {
  return createSvg(
    'M 12.6030 50.4905 C 13.3758 50.4905 13.9307 50.1140 14.8621 49.2421 L 20.6483 43.8720 C 19.5188 42.9803 18.6073 41.5733 18.6073 38.3433 L 18.6073 25.2052 C 18.6073 19.1217 22.3129 15.5152 28.3766 15.5152 L 42.2479 15.5152 L 42.2281 14.7622 C 41.9306 10.6999 39.2557 8.0643 34.7177 8.0643 L 7.5301 8.0643 C 2.9922 8.0643 0 10.7791 0 15.4954 L 0 34.9548 C 0 39.6710 2.9922 42.7028 7.5301 42.7028 L 10.8195 42.7028 L 10.8195 48.4693 C 10.8195 49.6979 11.4735 50.4905 12.6030 50.4905 Z M 44.6058 53.2450 C 45.7353 53.2450 46.3895 52.4325 46.3895 51.2237 L 46.3895 45.4374 L 48.4702 45.4374 C 53.0078 45.4374 56 42.4056 56 37.7092 L 56 25.6610 C 56 20.9250 53.0078 18.2300 48.4702 18.2300 L 28.8522 18.2300 C 24.1161 18.2300 21.3221 20.9250 21.3221 25.6610 L 21.3221 37.7092 C 21.3221 42.4056 24.1161 45.4374 28.8522 45.4374 L 35.1735 45.4374 L 42.3470 51.9767 C 43.2784 52.8487 43.8331 53.2450 44.6058 53.2450 Z',
    { viewBox: '0 -6 60 60' }
  );
}

export function createZapthreadsLightningIcon() {
  return createSvg(
    'M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z',
    { viewBox: '-120 -80 528 588' }
  );
}

export function createZapthreadsHeartIcon() {
  return createSvg(
    'M60.732 29.7C41.107 29.7 22 39.7 22 67.41c0 27.29 45.274 67.29 74 94.89 28.744-27.6 74-67.6 74-94.89 0-27.71-19.092-37.71-38.695-37.71C116 29.7 104.325 41.575 96 54.066 87.638 41.516 76 29.7 60.732 29.7z',
    { viewBox: '0 -16 180 180' }
  );
}

export function createZapthreadsQuoteIcon() {
  return createSvg(
    'M168 80c-13.3 0-24 10.7-24 24V408c0 8.4-1.4 16.5-4.1 24H440c13.3 0 24-10.7 24-24V104c0-13.3-10.7-24-24-24H168zM72 480c-39.8 0-72-32.2-72-72V112C0 98.7 10.7 88 24 88s24 10.7 24 24V408c0 13.3 10.7 24 24 24s24-10.7 24-24V104c0-39.8 32.2-72 72-72H440c39.8 0 72 32.2 72 72V408c0 39.8-32.2 72-72 72H72zM176 136c0-13.3 10.7-24 24-24h96c13.3 0 24 10.7 24 24v80c0 13.3-10.7 24-24 24H200c-13.3 0-24-10.7-24-24V136zm200-24h32c13.3 0 24 10.7 24 24s-10.7 24-24 24H376c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 80h32c13.3 0 24 10.7 24 24s-10.7 24-24 24H376c-13.3 0-24-10.7-24-24s10.7-24 24-24zM200 272H408c13.3 0 24 10.7 24 24s-10.7 24-24 24H200c-13.3 0-24-10.7-24-24s10.7-24 24-24zm0 80H408c13.3 0 24 10.7 24 24s-10.7 24-24 24H200c-13.3 0-24-10.7-24-24s10.7-24 24-24z',
    { viewBox: '0 0 576 512' }
  );
}

export function createZapthreadsEllipsisIcon() {
  return createSvg(
    'M8 256a56 56 0 1 1 112 0A56 56 0 1 1 8 256zm160 0a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm216-56a56 56 0 1 1 0 112 56 56 0 1 1 0-112z',
    { viewBox: '0 -200 560 640' }
  );
}

export function createZapthreadsPlayIcon() {
  return createSvg(
    'M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z',
    { viewBox: '0 -50 256 512' }
  );
}

export function createZapthreadsReplyIcon() {
  return createSvg(
    'M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z',
    { viewBox: '0 -50 320 512' }
  );
}

export function createZapthreadsAlertIcon() {
  const svg = createSvg(
    'M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z',
    { viewBox: '0 0 512 512' }
  );
  return svg;
}

export function createZapthreadsRoot() {
  const root = document.createElement('div');
  root.id = 'ztr-root';

  const style = document.createElement('style');
  root.appendChild(style);

  const watermark = document.createElement('div');
  watermark.className = 'blog-ztr-watermark';
  root.appendChild(watermark);

  return root;
}

export function createZapthreadsContentContainer() {
  const content = document.createElement('div');
  content.id = 'ztr-content';
  return content;
}

export function createZapthreadsErrorHeading() {
  const heading = document.createElement('h1');
  heading.textContent = 'Error!';
  return heading;
}

export function createZapthreadsErrorDetails() {
  const container = document.createElement('div');
  container.className = 'ztr-comment-text';

  const pre = document.createElement('pre');
  container.appendChild(pre);

  const message = document.createElement('p');
  message.textContent =
    'Only properly formed NIP-19 naddr, note and nevent encoded entities and URLs are supported.';
  container.appendChild(message);

  return container;
}

export function createZapthreadsTitleHeading() {
  const heading = document.createElement('h2');
  heading.id = 'ztr-title';
  return heading;
}

export function createZapthreadsPoweredByMessage() {
  const paragraph = document.createElement('p');
  paragraph.appendChild(document.createTextNode('Powered by '));

  const link = document.createElement('a');
  link.href = 'https://github.com/fr4nzap/zapthreads';
  link.textContent = 'zapthreads';
  paragraph.appendChild(link);

  return paragraph;
}

export function createZapthreadsClearCacheButton() {
  const button = document.createElement('button');
  button.textContent = 'Clear cache';
  return button;
}

export function createZapthreadsAnchorVersionLabel() {
  const paragraph = document.createElement('p');
  paragraph.textContent = 'Anchor version: ';
  return paragraph;
}
