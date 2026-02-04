import type { Locator } from "@playwright/test";

export interface PopoverMetrics {
  rect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  triggerRect?: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  viewport: { width: number; height: number };
  placement: string;
  state: string;
  popoverMaxWidth: string;
  tokenMaxWidth: string;
}

export async function getPanelMetrics(locator: Locator): Promise<PopoverMetrics> {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tokenValue = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--popover-inline-safe-max")
      .trim();
    const popoverMaxWidth = window
      .getComputedStyle(node)
      .getPropertyValue("--popover-max-width")
      .trim();

    return {
      rect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      viewport: { width: viewportWidth, height: viewportHeight },
      placement: (node as HTMLElement).dataset.popoverPlacement || "",
      state: (node as HTMLElement).dataset.popoverState || "",
      popoverMaxWidth,
      tokenMaxWidth: tokenValue,
    };
  });
}

export async function getPanelWithTriggerMetrics(panel: Locator, trigger: Locator): Promise<PopoverMetrics> {
  const triggerHandle = await trigger.elementHandle();
  if (!triggerHandle) {
    throw new Error("Trigger element is not attached");
  }

  try {
    return await panel.evaluate((node, triggerElement) => {
      const rect = node.getBoundingClientRect();
      const triggerRect = triggerElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const tokenValue = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--popover-inline-safe-max")
        .trim();
      const popoverMaxWidth = window
        .getComputedStyle(node)
        .getPropertyValue("--popover-max-width")
        .trim();

      return {
        rect: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        triggerRect: {
          top: triggerRect.top,
          left: triggerRect.left,
          right: triggerRect.right,
          bottom: triggerRect.bottom,
          width: triggerRect.width,
          height: triggerRect.height,
        },
        viewport: { width: viewportWidth, height: viewportHeight },
        placement: (node as HTMLElement).dataset.popoverPlacement || "",
        state: (node as HTMLElement).dataset.popoverState || "",
        popoverMaxWidth,
        tokenMaxWidth: tokenValue,
      };
    }, triggerHandle);
  } finally {
    await triggerHandle.dispose();
  }
}
