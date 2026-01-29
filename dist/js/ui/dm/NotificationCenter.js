function createElement(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (typeof text === "string") {
    element.textContent = text;
  }
  return element;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "dms", label: "DMs" },
  { id: "mentions", label: "Mentions" },
  { id: "zaps", label: "Zaps" },
];

const GROUPS = [
  { id: "unread", label: "Unread" },
  { id: "new", label: "New" },
];

const GROUP_EMPTY_COPY = {
  unread: "No unread notifications.",
  new: "No new notifications.",
};

function isElement(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

export function NotificationItem({ document: doc, notice = {}, onSelect } = {}) {
  if (!doc) {
    throw new Error("NotificationItem requires a document reference.");
  }

  const item = createElement(doc, "button", "dm-notification-item");
  item.type = "button";
  if (notice.variant) {
    item.classList.add(`dm-notification-item--${notice.variant}`);
  }
  if (notice.id) {
    item.dataset.noticeId = notice.id;
  }

  const iconSlot = createElement(doc, "span", "dm-notification-item__icon");
  if (notice.icon) {
    if (isElement(notice.icon)) {
      iconSlot.appendChild(notice.icon);
    } else if (typeof notice.icon === "string") {
      iconSlot.textContent = notice.icon;
    }
  }

  const body = createElement(doc, "div", "dm-notification-item__body");
  if (notice.title) {
    const title = createElement(
      doc,
      "div",
      "dm-notification-item__title",
      notice.title,
    );
    body.appendChild(title);
  }
  const message = createElement(
    doc,
    "div",
    "dm-notification-item__message",
    notice.message || "",
  );
  body.appendChild(message);

  const meta = createElement(doc, "div", "dm-notification-item__meta");
  const timestamp = createElement(
    doc,
    "time",
    "dm-notification-item__timestamp",
    notice.timestamp || "",
  );
  if (notice.timestampISO) {
    timestamp.dateTime = notice.timestampISO;
  }
  meta.appendChild(timestamp);

  item.appendChild(iconSlot);
  item.appendChild(body);
  item.appendChild(meta);

  if (typeof onSelect === "function") {
    item.addEventListener("click", () => {
      onSelect(notice);
    });
  }

  return item;
}

export function NotificationCenter({
  document: doc,
  notices = [],
  activeFilter = "all",
  onFilterSelect,
  onNoticeSelect,
} = {}) {
  if (!doc) {
    throw new Error("NotificationCenter requires a document reference.");
  }

  const root = createElement(doc, "section", "dm-notification-center");
  let currentFilter = activeFilter;

  const filterBar = createElement(doc, "div", "dm-notification-center__filters");
  const filterButtons = new Map();

  const updateFilterState = (nextFilter) => {
    currentFilter = nextFilter;
    filterButtons.forEach((button, filterId) => {
      const isActive = filterId === currentFilter;
      button.classList.toggle("dm-notification-center__filter-button--active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    renderGroups();
  };

  FILTERS.forEach((filter) => {
    const button = createElement(
      doc,
      "button",
      "dm-notification-center__filter-button",
      filter.label,
    );
    button.type = "button";
    button.dataset.filterId = filter.id;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (filter.id === currentFilter) {
        return;
      }
      updateFilterState(filter.id);
      if (typeof onFilterSelect === "function") {
        onFilterSelect(filter.id);
      }
    });
    filterButtons.set(filter.id, button);
    filterBar.appendChild(button);
  });

  const groupsContainer = createElement(doc, "div", "dm-notification-center__groups");

  const getFilteredNotices = () => {
    if (currentFilter === "all") {
      return notices;
    }
    return notices.filter((notice) => notice.type === currentFilter);
  };

  const renderGroups = () => {
    groupsContainer.innerHTML = "";
    const filteredNotices = getFilteredNotices();
    const groupMap = new Map();

    filteredNotices.forEach((notice) => {
      const groupId = notice.group || "new";
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId).push(notice);
    });

    GROUPS.forEach((group) => {
      const groupSection = createElement(
        doc,
        "section",
        "dm-notification-center__group",
      );
      const title = createElement(
        doc,
        "div",
        "dm-notification-center__group-title",
        group.label,
      );
      const list = createElement(doc, "div", "dm-notification-center__list");
      const groupNotices = groupMap.get(group.id) || [];

      if (!groupNotices.length) {
        list.appendChild(
          createElement(
            doc,
            "div",
            "dm-notification-center__empty",
            GROUP_EMPTY_COPY[group.id] || "No notifications.",
          ),
        );
      } else {
        groupNotices.forEach((notice) => {
          list.appendChild(
            NotificationItem({
              document: doc,
              notice,
              onSelect: onNoticeSelect,
            }),
          );
        });
      }

      groupSection.appendChild(title);
      groupSection.appendChild(list);
      groupsContainer.appendChild(groupSection);
    });
  };

  root.appendChild(filterBar);
  root.appendChild(groupsContainer);

  updateFilterState(currentFilter);

  return root;
}
