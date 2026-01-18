import { normalizeDesignSystemContext } from "../../designSystem.js";
import {
  normalizeHashtag,
  formatHashtag,
} from "../../utils/hashtagNormalization.js";

export const TAG_PREFERENCE_ACTIONS = {
  ADD_INTEREST: "add-interest",
  REMOVE_INTEREST: "remove-interest",
  ADD_DISINTEREST: "add-disinterest",
  REMOVE_DISINTEREST: "remove-disinterest",
};

function resolveDocument(documentRef) {
  if (documentRef && documentRef.nodeType === 9) {
    return documentRef;
  }
  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }
  return null;
}

function createElement(doc, tagName, { classNames = [], attrs = {}, textContent } = {}) {
  const el = doc.createElement(tagName);
  classNames
    .filter((name) => typeof name === "string" && name.trim())
    .forEach((name) => el.classList.add(name));
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    el.setAttribute(key, value);
  });
  if (typeof textContent === "string") {
    el.textContent = textContent;
  }
  return el;
}

function ensureMenuContainer(doc, panelClassNames = []) {
  const panel = createElement(doc, "div", {
    classNames: ["popover__panel", ...panelClassNames],
    attrs: { role: "menu" },
  });

  const list = createElement(doc, "div", {
    classNames: ["menu"],
    attrs: { role: "none" },
  });

  panel.appendChild(list);
  return { panel, list };
}

function appendMenuHeading(doc, list, text) {
  const heading = createElement(doc, "div", {
    classNames: ["menu__heading"],
    textContent: text,
  });
  list.appendChild(heading);
  return heading;
}

function appendMenuAction(doc, list, { text, action, dataset = {}, disabled = false }) {
  const button = createElement(doc, "button", {
    classNames: ["menu__item", "justify-start"],
    textContent: text,
    attrs: { type: "button", role: "menuitem" },
  });

  button.dataset.action = action;
  Object.entries(dataset).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    button.dataset[key] = String(value);
  });

  if (disabled) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  }

  list.appendChild(button);
  return button;
}

function normalizeTag(tag) {
  const normalized = normalizeHashtag(tag);
  return {
    label: normalized,
    normalized,
  };
}

function resolveMembership(membership = {}) {
  const state =
    typeof membership.state === "string" ? membership.state.trim().toLowerCase() : "";
  const interestFlag = membership.interest === true || state === "interest";
  const disinterestFlag = membership.disinterest === true || state === "disinterest";

  if (interestFlag && disinterestFlag) {
    // Favor the explicit state value when both flags are set to avoid conflicting UI states.
    if (state === "interest") {
      return { interest: true, disinterest: false };
    }
    if (state === "disinterest") {
      return { interest: false, disinterest: true };
    }
  }

  return {
    interest: Boolean(interestFlag && !disinterestFlag),
    disinterest: Boolean(disinterestFlag && !interestFlag),
  };
}

function setButtonDisabled(button, disabled) {
  if (!button) {
    return;
  }

  if (disabled) {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  } else {
    button.disabled = false;
    button.removeAttribute("aria-disabled");
  }
}

export function applyTagPreferenceMenuState({
  buttons = {},
  membership = {},
  isLoggedIn = false,
}) {
  const resolvedMembership = resolveMembership(membership);
  const disableAll = !isLoggedIn;

  setButtonDisabled(buttons.addInterest, disableAll || resolvedMembership.interest);
  setButtonDisabled(buttons.removeInterest, disableAll || !resolvedMembership.interest);
  setButtonDisabled(
    buttons.addDisinterest,
    disableAll || resolvedMembership.disinterest,
  );
  setButtonDisabled(
    buttons.removeDisinterest,
    disableAll || !resolvedMembership.disinterest,
  );
}

export function createTagPreferenceMenu({
  document: documentRef = null,
  tag = "",
  isLoggedIn = false,
  membership = {},
  onAction = null,
  designSystem = null,
} = {}) {
  const doc = resolveDocument(documentRef);
  if (!doc) {
    return null;
  }

  normalizeDesignSystemContext(designSystem);

  const { label, normalized } = normalizeTag(tag);
  const headingLabel = label ? formatHashtag(label) : "Tag preferences";

  const { panel, list } = ensureMenuContainer(doc, ["w-56", "p-0"]);
  panel.dataset.menu = "tag-preference";
  if (normalized) {
    panel.dataset.tag = normalized;
  }

  appendMenuHeading(doc, list, headingLabel);

  if (!isLoggedIn) {
    const message = createElement(doc, "p", {
      classNames: ["px-4", "pb-2", "text-xs", "text-muted"],
      textContent: "Sign in to personalize your recommendations.",
    });
    list.appendChild(message);
  }

  const buttons = {};
  const actionDataset = { tag: normalized };

  buttons.addInterest = appendMenuAction(doc, list, {
    text: "Add to interests",
    action: TAG_PREFERENCE_ACTIONS.ADD_INTEREST,
    dataset: actionDataset,
  });

  buttons.removeInterest = appendMenuAction(doc, list, {
    text: "Remove from interests",
    action: TAG_PREFERENCE_ACTIONS.REMOVE_INTEREST,
    dataset: actionDataset,
  });

  buttons.addDisinterest = appendMenuAction(doc, list, {
    text: "Add to disinterests",
    action: TAG_PREFERENCE_ACTIONS.ADD_DISINTEREST,
    dataset: actionDataset,
  });

  buttons.removeDisinterest = appendMenuAction(doc, list, {
    text: "Remove from disinterests",
    action: TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST,
    dataset: actionDataset,
  });

  applyTagPreferenceMenuState({ buttons, membership, isLoggedIn });

  const handleAction = (action, event, button) => {
    if (typeof onAction !== "function") {
      return;
    }
    try {
      onAction(action, {
        tag: normalized,
        normalizedTag: normalized,
        event,
        button,
      });
    } catch (error) {
      // Surface errors to callers by rethrowing to keep console visibility in dev mode.
      throw error;
    }
  };

  Object.entries(buttons).forEach(([, button]) => {
    if (!button) {
      return;
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.action;
      handleAction(action, event, button);
    });
  });

  return { panel, buttons };
}

export default createTagPreferenceMenu;
