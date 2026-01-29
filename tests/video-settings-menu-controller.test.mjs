import test from 'node:test';
import assert from 'node:assert/strict';
import VideoSettingsMenuController from '../js/ui/videoSettingsMenuController.js';

test('VideoSettingsMenuController - requestMenu opens popover', async () => {
  let popoverOpened = false;
  const mockPopover = {
    open: async () => { popoverOpened = true; },
    close: () => {},
    destroy: () => {},
    isOpen: () => false,
  };

  const createPopover = () => mockPopover;
  const createVideoSettingsMenuPanel = () => ({ querySelectorAll: () => [] });

  const controller = new VideoSettingsMenuController({
    createPopover,
    createVideoSettingsMenuPanel,
  });

  const trigger = { ownerDocument: {} };
  await controller.requestMenu({ trigger });

  assert.equal(popoverOpened, true);
});

test('VideoSettingsMenuController - closeMenu closes popover', async () => {
  let popoverClosed = false;
  const mockPopover = {
    open: async () => {},
    close: () => { popoverClosed = true; return true; },
    destroy: () => {},
    isOpen: () => true,
  };

  const createPopover = () => mockPopover;
  const createVideoSettingsMenuPanel = () => ({ querySelectorAll: () => [] });

  const controller = new VideoSettingsMenuController({
    createPopover,
    createVideoSettingsMenuPanel,
  });

  const trigger = { ownerDocument: {} };
  controller.requestMenu({ trigger }); // creates entry, calls close because isOpen is true

  // reset closed flag because requestMenu closed it
  popoverClosed = false;

  controller.closeMenu({ trigger });

  assert.equal(popoverClosed, true);
});

test('VideoSettingsMenuController - requestMenu toggles if open', async () => {
  let popoverClosed = false;
  const mockPopover = {
    open: async () => {},
    close: () => { popoverClosed = true; return true; },
    destroy: () => {},
    isOpen: () => true,
  };

  const createPopover = () => mockPopover;
  const createVideoSettingsMenuPanel = () => ({ querySelectorAll: () => [] });

  const controller = new VideoSettingsMenuController({
    createPopover,
    createVideoSettingsMenuPanel,
  });

  const trigger = { ownerDocument: {} };
  controller.requestMenu({ trigger }); // closes because isOpen=true
  popoverClosed = false;

  controller.requestMenu({ trigger }); // closes again

  assert.equal(popoverClosed, true);
});

test('VideoSettingsMenuController - closeAll closes all popovers', async () => {
  let closeCount = 0;

  const createPopover = () => {
      let open = false;
      return {
          open: async () => { open = true; },
          close: () => {
              if (open) {
                  closeCount++;
                  open = false;
                  return true;
              }
              return false;
          },
          destroy: () => {},
          isOpen: () => open,
      };
  };

  const createVideoSettingsMenuPanel = () => ({ querySelectorAll: () => [] });

  const controller = new VideoSettingsMenuController({
    createPopover,
    createVideoSettingsMenuPanel,
  });

  const trigger1 = { ownerDocument: {}, id: 1 };
  const trigger2 = { ownerDocument: {}, id: 2 };

  // These will open them because isOpen starts as false
  controller.requestMenu({ trigger: trigger1 });
  controller.requestMenu({ trigger: trigger2 });

  // Wait a tick for async open
  await Promise.resolve();

  controller.closeAll();

  assert.equal(closeCount, 2);
});
