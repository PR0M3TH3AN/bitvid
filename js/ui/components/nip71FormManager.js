// NOTE: Keep the Upload, Edit, and Revert modals in lockstep when updating NIP-71 form features.

const REPEATER_KEYS = ["imeta", "text-track", "segment", "t", "p", "r"];

export class Nip71FormManager {
  constructor({ defaultFocusSelector } = {}) {
    this.defaultFocusSelector =
      typeof defaultFocusSelector === "string"
        ? defaultFocusSelector
        : "[data-nip71-field], [data-nip71-nested-field]";
    this.sections = new Map();
  }

  registerSection(key, root) {
    if (!key) {
      return null;
    }

    if (!root) {
      this.sections.delete(key);
      return null;
    }

    const store = this.cacheSection(root);
    this.sections.set(key, store);
    return store;
  }

  bindSection(key) {
    const store = this.getSection(key);
    if (!store?.root) {
      return;
    }

    if (store.handlers?.click) {
      try {
        store.root.removeEventListener("click", store.handlers.click);
      } catch (error) {
        console.warn("[Nip71FormManager] Failed to detach previous handler", error);
      }
    }

    const handleClick = (event) => {
      const addTrigger = event.target?.closest?.("[data-nip71-add]");
      if (addTrigger && store.root.contains(addTrigger)) {
        event.preventDefault();
        const targetKey = addTrigger.dataset?.nip71Add || "";
        const entry = this.addRepeaterEntry(key, targetKey);
        if (entry) {
          this.focusFirstField(entry, store.focusSelector);
        }
        return;
      }

      const nestedAddTrigger = event.target?.closest?.("[data-nip71-nested-add]");
      if (nestedAddTrigger && store.root.contains(nestedAddTrigger)) {
        event.preventDefault();
        const nestedKey = nestedAddTrigger.dataset?.nip71NestedAdd || "";
        const container = nestedAddTrigger.closest(
          `[data-nip71-nested="${nestedKey}"]`
        );
        const entry = this.addNestedEntry(container, nestedKey);
        if (entry) {
          this.focusFirstField(
            entry,
            `[data-nip71-nested-field="${nestedKey}"]`
          );
        }
        return;
      }

      const removeTrigger = event.target?.closest?.("[data-nip71-remove]");
      if (removeTrigger && store.root.contains(removeTrigger)) {
        event.preventDefault();
        const targetKey = removeTrigger.dataset?.nip71Remove || "";
        if (!targetKey) {
          return;
        }

        if (targetKey === "nested") {
          const nestedEntry = removeTrigger.closest("[data-nip71-nested-entry]");
          this.removeNestedEntry(nestedEntry);
          return;
        }

        this.removeRepeaterEntry(key, targetKey, removeTrigger);
      }
    };

    store.root.addEventListener("click", handleClick);
    store.handlers.click = handleClick;
  }

  resetSection(key) {
    const store = this.getSection(key);
    if (!store) {
      return;
    }

    if (Array.isArray(store.kindInputs)) {
      store.kindInputs.forEach((input) => {
        if (!input) {
          return;
        }
        input.checked = Boolean(input.defaultChecked);
      });
    }

    if (store.summaryInput) {
      store.summaryInput.value = "";
    }
    if (store.publishedAtInput) {
      store.publishedAtInput.value = "";
    }
    if (store.altInput) {
      store.altInput.value = "";
    }
    if (store.durationInput) {
      store.durationInput.value = "";
    }
    if (store.contentWarningInput) {
      store.contentWarningInput.value = "";
    }

    if (store.repeaters) {
      Object.entries(store.repeaters).forEach(([repeaterKey, repeater]) => {
        if (!repeater?.list) {
          return;
        }
        const entries = Array.from(
          repeater.list.querySelectorAll(
            `[data-nip71-entry="${repeaterKey}"]`
          )
        );
        entries.forEach((entry) => {
          if (entry.dataset?.nip71Primary === "true") {
            this.resetEntry(entry);
          } else {
            entry.remove();
          }
        });
      });
    }
  }

  hydrateSection(key, metadata) {
    const store = this.getSection(key);
    if (!store) {
      return;
    }

    this.resetSection(key);

    if (!metadata || typeof metadata !== "object") {
      return;
    }

    if (Array.isArray(store.kindInputs)) {
      const targetValue = metadata.kind != null ? `${metadata.kind}`.trim() : "";
      if (targetValue) {
        store.kindInputs.forEach((input) => {
          if (!input) {
            return;
          }
          input.checked = `${input.value}` === targetValue;
        });
      }
    }

    if (store.summaryInput) {
      store.summaryInput.value = this.toInputValue(metadata.summary);
    }
    if (store.publishedAtInput) {
      const value =
        metadata.publishedAt ?? metadata.published_at ?? metadata["published-at"];
      store.publishedAtInput.value = this.toInputValue(value);
    }
    if (store.altInput) {
      store.altInput.value = this.toInputValue(metadata.alt);
    }
    if (store.durationInput) {
      const duration = this.normalizeNumber(metadata.duration);
      store.durationInput.value = duration != null ? `${duration}` : "";
    }
    if (store.contentWarningInput) {
      const value =
        metadata.contentWarning ??
        metadata["content-warning"] ??
        metadata.content_warning;
      store.contentWarningInput.value = this.toInputValue(value);
    }

    this.hydrateRepeater(key, "imeta", metadata.imeta, (entry, value) => {
      if (!value || typeof value !== "object") {
        return;
      }
      this.setFieldValue(entry, "m", value.m);
      this.setFieldValue(entry, "dim", value.dim);
      this.setFieldValue(entry, "url", value.url);
      this.setFieldValue(entry, "x", value.x);
      this.hydrateNested(entry, "image", value.image);
      this.hydrateNested(entry, "fallback", value.fallback);
      this.hydrateNested(entry, "service", value.service);
    });

    this.hydrateRepeater(
      key,
      "text-track",
      metadata.textTracks ?? metadata["text-track"] ?? metadata.text_track,
      (entry, value) => {
        if (!value || typeof value !== "object") {
          return;
        }
        this.setFieldValue(entry, "url", value.url);
        this.setFieldValue(entry, "type", value.type);
        this.setFieldValue(entry, "language", value.language);
      }
    );

    this.hydrateRepeater(key, "segment", metadata.segments, (entry, value) => {
      if (!value || typeof value !== "object") {
        return;
      }
      this.setFieldValue(entry, "start", value.start);
      this.setFieldValue(entry, "end", value.end);
      this.setFieldValue(entry, "title", value.title);
      this.setFieldValue(entry, "thumbnail", value.thumbnail);
    });

    const sanitizedHashtags = this.sanitizeHashtags(
      metadata.hashtags ?? metadata.t,
      { dedupe: true }
    );
    this.hydrateRepeater(key, "t", sanitizedHashtags, (entry, value) => {
      this.setFieldValue(entry, "value", this.renderHashtagValue(value));
    });

    this.hydrateRepeater(
      key,
      "p",
      metadata.participants ?? metadata.p,
      (entry, value) => {
        if (!value || typeof value !== "object") {
          return;
        }
        this.setFieldValue(entry, "pubkey", value.pubkey ?? value["pubkey"]);
        this.setFieldValue(entry, "relay", value.relay ?? value["relay"]);
      }
    );

    this.hydrateRepeater(
      key,
      "r",
      metadata.references ?? metadata.r,
      (entry, value) => {
        this.setFieldValue(entry, "url", value);
      }
    );
  }

  collectSection(key) {
    const store = this.getSection(key);
    if (!store) {
      return null;
    }

    const kindInput = Array.isArray(store.kindInputs)
      ? store.kindInputs.find((input) => input?.checked)
      : null;
    let kind = null;
    if (kindInput?.value != null) {
      const parsed = Number(kindInput.value);
      kind = Number.isFinite(parsed) ? parsed : String(kindInput.value).trim();
    }

    const summary = this.getTrimmedValue(store.summaryInput);
    const publishedAt = this.getTrimmedValue(store.publishedAtInput);
    const alt = this.getTrimmedValue(store.altInput);

    let duration = null;
    if (store.durationInput) {
      const rawValue = store.durationInput.value;
      if (rawValue !== "" && rawValue != null) {
        const parsed = Number(rawValue);
        if (Number.isFinite(parsed)) {
          duration = parsed;
        }
      }
    }

    const contentWarning = this.getTrimmedValue(store.contentWarningInput);

    const imeta = this.collectRepeaterValues(key, "imeta", (entry) => {
      const variant = {
        m: this.getFieldValue(entry, "m"),
        dim: this.getFieldValue(entry, "dim"),
        url: this.getFieldValue(entry, "url"),
        x: this.getFieldValue(entry, "x"),
        image: this.collectNestedValues(entry, "image"),
        fallback: this.collectNestedValues(entry, "fallback"),
        service: this.collectNestedValues(entry, "service"),
      };

      const hasContent =
        variant.m ||
        variant.dim ||
        variant.url ||
        variant.x ||
        variant.image.length > 0 ||
        variant.fallback.length > 0 ||
        variant.service.length > 0;

      return hasContent ? variant : null;
    });

    const textTracks = this.collectRepeaterValues(
      key,
      "text-track",
      (entry) => {
        const track = {
          url: this.getFieldValue(entry, "url"),
          type: this.getFieldValue(entry, "type"),
          language: this.getFieldValue(entry, "language"),
        };

        const hasContent = track.url || track.type || track.language;
        return hasContent ? track : null;
      }
    );

    const segments = this.collectRepeaterValues(key, "segment", (entry) => {
      const segment = {
        start: this.getFieldValue(entry, "start"),
        end: this.getFieldValue(entry, "end"),
        title: this.getFieldValue(entry, "title"),
        thumbnail: this.getFieldValue(entry, "thumbnail"),
      };

      const hasContent =
        segment.start || segment.end || segment.title || segment.thumbnail;
      return hasContent ? segment : null;
    });

    const hashtags = this.sanitizeHashtags(
      this.collectRepeaterValues(key, "t", (entry) => {
        const value = this.getFieldValue(entry, "value");
        return value || null;
      }),
      { dedupe: true }
    );

    const participants = this.collectRepeaterValues(key, "p", (entry) => {
      const participant = {
        pubkey: this.getFieldValue(entry, "pubkey"),
        relay: this.getFieldValue(entry, "relay"),
      };

      const hasContent = participant.pubkey || participant.relay;
      return hasContent ? participant : null;
    });

    const references = this.collectRepeaterValues(key, "r", (entry) => {
      const url = this.getFieldValue(entry, "url");
      return url || null;
    });

    return {
      kind,
      summary,
      publishedAt,
      alt,
      duration,
      contentWarning,
      imeta,
      textTracks,
      segments,
      hashtags,
      participants,
      references,
    };
  }

  collectRepeaterValues(sectionKey, repeaterKey, mapFn) {
    const store = this.getSection(sectionKey);
    const repeater = store?.repeaters?.[repeaterKey];
    if (!repeater?.list) {
      return [];
    }

    const entries = Array.from(
      repeater.list.querySelectorAll(`[data-nip71-entry="${repeaterKey}"]`)
    );

    const results = [];
    entries.forEach((entry) => {
      const value = typeof mapFn === "function" ? mapFn(entry) : null;
      if (value == null) {
        return;
      }
      if (typeof value === "string") {
        if (value.trim()) {
          results.push(value.trim());
        }
        return;
      }
      results.push(value);
    });

    return results;
  }

  sanitizeHashtags(values, { dedupe = false } = {}) {
    if (!Array.isArray(values)) {
      return [];
    }

    const results = [];
    const seen = new Set();

    values.forEach((value) => {
      const sanitized = this.sanitizeHashtagValue(value);
      if (!sanitized) {
        return;
      }
      const dedupeKey = sanitized.toLowerCase();
      if (dedupe) {
        if (seen.has(dedupeKey)) {
          return;
        }
        seen.add(dedupeKey);
      }
      results.push(sanitized);
    });

    return results;
  }

  sanitizeHashtagValue(value) {
    if (typeof value === "number") {
      value = Number.isFinite(value) ? `${value}` : "";
    }
    if (typeof value !== "string") {
      value = `${value ?? ""}`;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const withoutHash = trimmed.replace(/^#+/, "").trim();
    if (!withoutHash) {
      return "";
    }

    return withoutHash.toLowerCase();
  }

  renderHashtagValue(value) {
    const sanitized = this.sanitizeHashtagValue(value);
    return sanitized ? `#${sanitized}` : "";
  }

  collectNestedValues(entry, nestedKey) {
    if (!entry || !nestedKey) {
      return [];
    }

    const container = entry.querySelector(
      `[data-nip71-nested="${nestedKey}"]`
    );
    if (!container) {
      return [];
    }

    const fields = Array.from(
      container.querySelectorAll(`[data-nip71-nested-field="${nestedKey}"]`)
    );

    return fields
      .map((field) => this.getTrimmedValue(field))
      .filter((value) => Boolean(value));
  }

  addRepeaterEntry(sectionKey, repeaterKey) {
    if (!repeaterKey) {
      return null;
    }

    const store = this.getSection(sectionKey);
    if (!store?.repeaters || !store.repeaters[repeaterKey]) {
      return null;
    }

    const { list, template } = store.repeaters[repeaterKey];
    if (!list || !template) {
      return null;
    }

    const fragment = template.content
      ? template.content.cloneNode(true)
      : template.cloneNode(true);

    const entry =
      fragment.querySelector?.(`[data-nip71-entry="${repeaterKey}"]`) ||
      fragment.firstElementChild ||
      null;

    list.appendChild(fragment);

    return entry;
  }

  removeRepeaterEntry(sectionKey, repeaterKey, trigger) {
    if (!repeaterKey || !trigger) {
      return;
    }

    const store = this.getSection(sectionKey);
    if (!store?.repeaters?.[repeaterKey]?.list) {
      return;
    }

    const entry = trigger.closest(`[data-nip71-entry="${repeaterKey}"]`);
    if (!entry) {
      return;
    }

    if (entry.dataset?.nip71Primary === "true") {
      this.resetEntry(entry);
      return;
    }

    entry.remove();
  }

  addNestedEntry(container, nestedKey) {
    if (!container || !nestedKey) {
      return null;
    }

    const list = container.querySelector(
      `[data-nip71-nested-list="${nestedKey}"]`
    );
    const template = container.querySelector(
      `[data-nip71-nested-template="${nestedKey}"]`
    );

    if (!list || !template) {
      return null;
    }

    const fragment = template.content
      ? template.content.cloneNode(true)
      : template.cloneNode(true);

    const entry =
      fragment.querySelector?.(`[data-nip71-nested-entry="${nestedKey}"]`) ||
      fragment.firstElementChild ||
      null;

    list.appendChild(fragment);

    return entry;
  }

  removeNestedEntry(entry) {
    if (!entry) {
      return;
    }
    entry.remove();
  }

  resetEntry(entry) {
    if (!entry) {
      return;
    }

    const fields = entry.querySelectorAll("[data-nip71-field]");
    fields.forEach((field) => {
      if (field) {
        field.value = "";
      }
    });

    const nestedContainers = entry.querySelectorAll("[data-nip71-nested]");
    nestedContainers.forEach((container) => {
      if (!container?.dataset?.nip71Nested) {
        return;
      }
      const list = container.querySelector(
        `[data-nip71-nested-list="${container.dataset.nip71Nested}"]`
      );
      if (list) {
        list.innerHTML = "";
      }
    });
  }

  hydrateRepeater(sectionKey, repeaterKey, rawValues, applyValue) {
    const values = Array.isArray(rawValues) ? rawValues : [];
    if (!values.length) {
      return;
    }

    const store = this.getSection(sectionKey);
    const repeater = store?.repeaters?.[repeaterKey];
    if (!repeater?.list) {
      return;
    }

    let entries = Array.from(
      repeater.list.querySelectorAll(`[data-nip71-entry="${repeaterKey}"]`)
    );

    values.forEach((value, index) => {
      let entry = entries[index];
      if (!entry) {
        entry = this.addRepeaterEntry(sectionKey, repeaterKey);
        if (entry) {
          entries.push(entry);
        }
      }
      if (!entry) {
        return;
      }
      if (typeof applyValue === "function") {
        applyValue(entry, value, index);
      }
    });
  }

  hydrateNested(entry, nestedKey, rawValues) {
    if (!entry) {
      return;
    }

    const values = Array.isArray(rawValues)
      ? rawValues.filter((value) => this.toInputValue(value))
      : [];
    if (!values.length) {
      return;
    }

    const container = entry.querySelector(`[data-nip71-nested="${nestedKey}"]`);
    if (!container) {
      return;
    }

    values.forEach((value) => {
      const nestedEntry = this.addNestedEntry(container, nestedKey);
      if (!nestedEntry) {
        return;
      }
      const field = nestedEntry.querySelector(
        `[data-nip71-nested-field="${nestedKey}"]`
      );
      if (field) {
        field.value = this.toInputValue(value);
      }
    });
  }

  setFieldValue(entry, field, value) {
    if (!entry || !field) {
      return;
    }
    const element = entry.querySelector(`[data-nip71-field="${field}"]`);
    if (!element) {
      return;
    }
    element.value = this.toInputValue(value);
  }

  focusFirstField(container, selector) {
    if (!container) {
      return;
    }
    const targetSelector = selector || this.defaultFocusSelector;
    const target = container.querySelector(targetSelector);
    if (target?.focus) {
      target.focus();
    }
  }

  getFieldValue(entry, field) {
    if (!entry || !field) {
      return "";
    }
    const element = entry.querySelector(`[data-nip71-field="${field}"]`);
    return this.getTrimmedValue(element);
  }

  getTrimmedValue(element) {
    if (!element) {
      return "";
    }
    const { value } = element;
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value).trim() : "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return String(value ?? "").trim();
  }

  toInputValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? `${value}` : "";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return `${value ?? ""}`;
  }

  normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  cacheSection(section) {
    const repeaters = {};
    REPEATER_KEYS.forEach((key) => {
      repeaters[key] = this.cacheRepeater(section, key);
    });

    return {
      root: section,
      focusSelector: this.defaultFocusSelector,
      kindInputs: Array.from(section.querySelectorAll('[data-nip71-input="kind"]')),
      publishedAtInput:
        section.querySelector('[data-nip71-input="published_at"]') || null,
      altInput: section.querySelector('[data-nip71-input="alt"]') || null,
      durationInput:
        section.querySelector('[data-nip71-input="duration"]') || null,
      contentWarningInput:
        section.querySelector('[data-nip71-input="content-warning"]') || null,
      summaryInput: section.querySelector('[data-nip71-input="summary"]') || null,
      repeaters,
      handlers: {},
    };
  }

  cacheRepeater(section, key) {
    if (!section || !key) {
      return null;
    }

    const repeaterRoot = section.querySelector(
      `[data-nip71-repeater="${key}"]`
    );
    if (!repeaterRoot) {
      return null;
    }

    return {
      root: repeaterRoot,
      list: repeaterRoot.querySelector(`[data-nip71-list="${key}"]`) || null,
      template:
        repeaterRoot.querySelector(`[data-nip71-template="${key}"]`) || null,
    };
  }

  getSection(key) {
    if (!key) {
      return null;
    }
    return this.sections.get(key) || null;
  }
}

