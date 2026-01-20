// js/analyticsConfig.js
// Central configuration for site-wide analytics tracking.

export const ANALYTICS_CONFIG = Object.freeze({
  /**
   * Hosted Umami script that powers analytics.
   * Update this value if the tracker is relocated.
   */
  scriptSrc: "https://umami.malin.onl/script.js",
  /**
   * The Umami website identifier for this deployment.
   */
  websiteId: "1f8eead2-79f0-4dba-8c3b-ed9b08b6e877",
  /**
   * Event name used when recording individual video views.
   */
  videoViewEventName: "video_view",
});
