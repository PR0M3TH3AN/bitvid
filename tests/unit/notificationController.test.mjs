import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import NotificationController from '../../js/ui/notificationController.js';

// Simple mock for HTMLElement
class MockHTMLElement {
  constructor() {
    this.classList = {
      contains: mock.fn(() => false),
      add: mock.fn(),
      remove: mock.fn(),
      toggle: mock.fn(),
    };
    this.textContent = '';
    this.querySelector = mock.fn(() => null);
    this.contains = mock.fn(() => false);
    this.insertBefore = mock.fn();
    this.remove = mock.fn();
    this.firstChild = null;
    this.setAttribute = mock.fn();
  }
}

describe('NotificationController', () => {
  let controller;
  let mockPortal;
  let mockErrorContainer;
  let mockSuccessContainer;
  let mockStatusContainer;
  let mockWindow;
  let mockDocument;
  let mockUserLogger;
  let mockDevLogger;

  beforeEach(() => {
    mockPortal = new MockHTMLElement();
    mockErrorContainer = new MockHTMLElement();
    mockSuccessContainer = new MockHTMLElement();
    mockStatusContainer = new MockHTMLElement();

    mockWindow = {
      HTMLElement: MockHTMLElement,
      setTimeout: mock.fn((cb, ms) => setTimeout(cb, ms)),
      clearTimeout: mock.fn((id) => clearTimeout(id)),
    };

    mockDocument = {
        createElement: mock.fn(() => new MockHTMLElement()),
    };

    mockUserLogger = { error: mock.fn() };
    mockDevLogger = { log: mock.fn() };

    controller = new NotificationController({
      portal: mockPortal,
      errorContainer: mockErrorContainer,
      successContainer: mockSuccessContainer,
      statusContainer: mockStatusContainer,
      loggers: { userLogger: mockUserLogger, devLogger: mockDevLogger },
      documentRef: mockDocument,
      windowRef: mockWindow,
    });
  });

  afterEach(() => {
    controller.destroy();
    mock.reset();
  });

  it('should instantiate correctly', () => {
    assert.strictEqual(controller.portal, mockPortal);
    assert.strictEqual(controller.errorContainer, mockErrorContainer);
  });

  it('showError should update text content and show container', () => {
    const msg = 'Test Error';
    controller.showError(msg);

    assert.strictEqual(mockErrorContainer.textContent, msg);
    assert.strictEqual(mockErrorContainer.classList.remove.mock.calls.length, 1);
    assert.strictEqual(mockErrorContainer.classList.remove.mock.calls[0].arguments[0], 'hidden');
    assert.strictEqual(mockUserLogger.error.mock.calls.length, 1);
    assert.strictEqual(mockUserLogger.error.mock.calls[0].arguments[0], msg);
  });

  it('showError should hide container when msg is empty', () => {
    controller.showError('');

    assert.strictEqual(mockErrorContainer.textContent, '');
    assert.strictEqual(mockErrorContainer.classList.add.mock.calls.length, 1);
    assert.strictEqual(mockErrorContainer.classList.add.mock.calls[0].arguments[0], 'hidden');
  });

  it('updateNotificationPortalVisibility should toggle active class on portal', () => {
      // Simulate error container being visible
      mockErrorContainer.classList.contains = mock.fn((cls) => cls !== 'hidden');

      controller.updateNotificationPortalVisibility();

      assert.strictEqual(mockPortal.classList.toggle.mock.calls.length, 1);
      assert.strictEqual(mockPortal.classList.toggle.mock.calls[0].arguments[0], 'notification-portal--active');
      assert.strictEqual(mockPortal.classList.toggle.mock.calls[0].arguments[1], true);
  });

  it('showSuccess should update text content and show container', () => {
      const msg = 'Success!';
      controller.showSuccess(msg);

      assert.strictEqual(mockSuccessContainer.textContent, msg);
      assert.strictEqual(mockSuccessContainer.classList.remove.mock.calls.length, 1);
      assert.strictEqual(mockSuccessContainer.classList.remove.mock.calls[0].arguments[0], 'hidden');
  });

  it('showStatus should update text content and show container', () => {
      const msg = 'Status update';
      controller.showStatus(msg);

      assert.strictEqual(mockStatusContainer.textContent, msg);
      assert.strictEqual(mockStatusContainer.classList.remove.mock.calls.length, 1);
      assert.strictEqual(mockStatusContainer.classList.remove.mock.calls[0].arguments[0], 'hidden');
  });

  it('showStatus should handle spinner option', () => {
      const msg = 'Loading...';
      const mockSpinner = new MockHTMLElement();
      mockDocument.createElement = mock.fn(() => mockSpinner);

      controller.showStatus(msg, { showSpinner: true });

      assert.strictEqual(mockDocument.createElement.mock.calls.length, 1);
      assert.strictEqual(mockStatusContainer.insertBefore.mock.calls.length, 1);
  });
});
