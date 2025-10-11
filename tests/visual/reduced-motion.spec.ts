import { expect, test } from "@playwright/test";

type MotionCase = {
  name: string;
  html: string;
  selector: string;
  expectations: {
    checkTransitions?: boolean;
    checkAnimations?: boolean;
    expectTransformNone?: boolean;
    expectOpacity?: string;
  };
};

const MOTION_CASES: MotionCase[] = [
  {
    name: "primary button",
    html: '<button class="btn">Action</button>',
    selector: ".btn",
    expectations: { checkTransitions: true }
  },
  {
    name: "card enter motion",
    html: '<article class="card" data-motion="enter"></article>',
    selector: ".card",
    expectations: {
      checkTransitions: true,
      checkAnimations: true,
      expectOpacity: "1"
    }
  },
  {
    name: "popover panel",
    html: '<div class="popover__panel" data-state="open"></div>',
    selector: ".popover__panel",
    expectations: {
      checkTransitions: true,
      expectTransformNone: true
    }
  },
  {
    name: "modal panel",
    html: '<div class="bv-modal__panel modal-content"></div>',
    selector: ".bv-modal__panel",
    expectations: { checkTransitions: true }
  },
  {
    name: "video modal content",
    html: '<div id="playerModal"><div class="player-modal__content"></div></div>',
    selector: "#playerModal .player-modal__content",
    expectations: { checkTransitions: true, checkAnimations: true }
  },
  {
    name: "progress indicator",
    html: '<div class="progress-bar"><div class="progress-bar-fill"></div></div>',
    selector: ".progress-bar-fill",
    expectations: { checkTransitions: true }
  },
  {
    name: "sidebar nav link",
    html: '<a class="sidebar-nav-link" href="#"></a>',
    selector: ".sidebar-nav-link",
    expectations: { checkTransitions: true }
  },
  {
    name: "status spinner",
    html: '<div class="status-spinner--inline"></div>',
    selector: ".status-spinner--inline",
    expectations: { checkAnimations: true }
  }
];

test.describe("reduced motion guardrail", () => {
  test("collapses transitions and animations when prefers-reduced-motion is set", async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/docs/kitchen-sink.html", { waitUntil: "networkidle" });

    for (const motionCase of MOTION_CASES) {
      const styles = await page.evaluate(({ html, selector }) => {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-test-motion", "true");
        wrapper.innerHTML = html;
        const element = wrapper.querySelector(selector);
        if (!element) {
          throw new Error(`Missing element for selector ${selector}`);
        }
        document.body.appendChild(wrapper);
        const computedStyle = window.getComputedStyle(element);
        const result = {
          transitionDuration: computedStyle.transitionDuration,
          animationDuration: computedStyle.animationDuration,
          animationName: computedStyle.animationName,
          transform: computedStyle.transform,
          opacity: computedStyle.opacity
        };
        wrapper.remove();
        return result;
      }, motionCase);

      if (motionCase.expectations.checkTransitions) {
        const durations = styles.transitionDuration
          .split(",")
          .map((value) => value.trim());
        expect.soft(
          durations.every((value) => value === "0s"),
          `${motionCase.name} transition duration`
        ).toBe(true);
      }

      if (motionCase.expectations.checkAnimations) {
        const durations = styles.animationDuration
          .split(",")
          .map((value) => value.trim());
        expect.soft(
          durations.every((value) => value === "0s"),
          `${motionCase.name} animation duration`
        ).toBe(true);
        expect.soft(
          styles.animationName === "none",
          `${motionCase.name} animation name`
        ).toBe(true);
      }

      if (motionCase.expectations.expectTransformNone) {
        expect.soft(styles.transform === "none", `${motionCase.name} transform`).toBe(
          true
        );
      }

      if (motionCase.expectations.expectOpacity) {
        expect.soft(styles.opacity).toBe(motionCase.expectations.expectOpacity);
      }
    }
  });
});
