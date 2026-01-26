import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import createTagPreferenceMenu, {
  TAG_PREFERENCE_ACTIONS,
  applyTagPreferenceMenuState
} from "../../js/ui/components/tagPreferenceMenu.js";
import Application from "../../js/app.js";

test("createTagPreferenceMenu renders heading and actions", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const menu = createTagPreferenceMenu({
    document,
    tag: "#Nostr",
    isLoggedIn: true
  });

  assert(menu, "menu should render");
  const { panel, buttons } = menu;
  assert.equal(panel.dataset.menu, "tag-preference");
  assert.equal(panel.dataset.tag, "nostr");
  const heading = panel.querySelector(".menu__heading");
  assert(heading, "heading should be rendered");
  assert.equal(heading.textContent, "#nostr");

  assert.equal(typeof buttons.addInterest, "object");
  assert.equal(
    buttons.addInterest.dataset.action,
    TAG_PREFERENCE_ACTIONS.ADD_INTEREST
  );
  assert.equal(
    buttons.removeDisinterest.dataset.action,
    TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST
  );
});

test("createTagPreferenceMenu disables actions based on membership and login", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const { buttons, panel } = createTagPreferenceMenu({
    document,
    tag: "video",
    isLoggedIn: false,
    membership: { state: "interest" }
  });

  assert(
    buttons.addInterest.disabled,
    "add interest should be disabled for interest state"
  );
  assert(
    buttons.removeInterest.disabled,
    "remove interest should be disabled when logged out"
  );
  assert(
    buttons.addDisinterest.disabled,
    "add disinterest should require login"
  );
  assert(
    buttons.removeDisinterest.disabled,
    "remove disinterest should require login"
  );

  const message = panel.querySelector("p.text-xs");
  assert(message, "login message should be present when logged out");

  applyTagPreferenceMenuState({
    buttons,
    isLoggedIn: true,
    membership: { state: "disinterest" }
  });

  assert.equal(buttons.addInterest.disabled, false);
  assert.equal(buttons.removeInterest.disabled, true);
  assert.equal(buttons.addDisinterest.disabled, true);
  assert.equal(buttons.removeDisinterest.disabled, false);
});

test("createTagPreferenceMenu forwards actions to callback", () => {
  const { document } = new JSDOM("<!DOCTYPE html>").window;
  const events = [];
  const { panel, buttons } = createTagPreferenceMenu({
    document,
    tag: "art",
    isLoggedIn: true,
    membership: { state: "disinterest" },
    onAction(action, detail) {
      events.push({ action, detail });
    }
  });

  document.body.append(panel);

  buttons.addInterest.click();
  buttons.removeDisinterest.click();

  assert.equal(events.length, 2);
  assert.equal(events[0].action, TAG_PREFERENCE_ACTIONS.ADD_INTEREST);
  assert.equal(events[0].detail.tag, "art");
  assert.equal(events[1].action, TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST);
  assert.equal(events[1].detail.normalizedTag, "art");
});
