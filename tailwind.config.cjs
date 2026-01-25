const typography = require("@tailwindcss/typography");

module.exports = {
  content: [
    "./index.html",
    "./embed.html",
    "./components/**/*.html",
    "./views/**/*.html",
    "./js/**/*.js",
    "./torrent/**/*.html",
    "./torrent/**/*.js"
  ],
  safelist: [
    "bv-logo__background",
    "p-0",
    "sm:p-0",
    "lg:p-8",
    "w-full",
    "h-full",
    "max-w-none",
    "rounded-none",
    "border-0",
    "lg:max-w-5xl",
    "lg:rounded-modal-xl",
    "lg:border",
    "lg:h-auto"
  ],
  theme: {
    extend: {
      screens: {
        xs: "30rem",
        compact: "25rem"
      },
      colors: {
        page: "var(--color-page)",
        "page-alt": "var(--color-page-alt)",
        surface: {
          DEFAULT: "var(--surface-base)",
          alt: "var(--surface-alt)",
          raised: "var(--surface-raised)",
          "raised-private": "var(--surface-raised-private)",
          "raised-critical": "var(--surface-raised-critical)",
          panel: "var(--surface-panel)",
          "panel-hover": "var(--surface-panel-hover)",
          sunken: "var(--surface-sunken)",
          muted: "var(--surface-muted)",
          inverse: "var(--surface-inverse)"
        },
        overlay: {
          DEFAULT: "var(--surface-overlay)",
          muted: "var(--surface-overlay-muted)",
          strong: "var(--surface-overlay-strong)",
          darker: "var(--surface-overlay-darker)",
          veil: "var(--surface-veil)",
          panel: "var(--surface-overlay-panel)",
          "panel-soft": "var(--surface-overlay-panel-soft)",
          "panel-tint": "var(--surface-overlay-panel-tint)",
          "panel-glass": "var(--surface-overlay-panel-glass)",
          "panel-glass-soft": "var(--surface-overlay-panel-glass-soft)",
          black: "var(--surface-overlay-black)"
        },
        shadow: {
          intense: "var(--color-shadow-intense)"
        },
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        panel: {
          DEFAULT: "var(--surface-panel)",
          hover: "var(--surface-panel-hover)"
        },
        card: {
          DEFAULT: "var(--surface-raised)",
          private: "var(--surface-raised-private)",
          critical: "var(--surface-raised-critical)"
        },
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
          translucent: "var(--border-overlay)",
          "translucent-strong": "var(--color-border-translucent-strong)",
          "translucent-bright": "var(--color-border-translucent-bright)",
          "translucent-medium": "var(--color-border-translucent-medium)",
          "translucent-stronger": "var(--color-border-translucent-stronger)",
          "translucent-strongest": "var(--color-border-translucent-strongest)",
          "translucent-glow": "var(--border-overlay-glow)",
          "info-soft": "var(--border-info-soft)",
          "neutral-soft": "var(--border-neutral-soft)",
          "sidebar-strong": "var(--border-sidebar-strong)"
        },
        text: {
          DEFAULT: "var(--text-primary)",
          strong: "var(--color-text-strong)",
          inverse: "var(--text-inverse)",
          muted: "var(--text-muted)",
          "muted-strong": "var(--text-muted-strong)",
          subtle: "var(--text-subtle)",
          frosted: "var(--text-frosted-primary)",
          "frosted-strong": "var(--text-frosted-strong)",
          "frosted-soft": "var(--text-frosted-soft)"
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          strong: "var(--color-muted-strong)",
          alt: "var(--color-muted-alt)"
        },
        info: {
          DEFAULT: "var(--color-info)",
          strong: "var(--color-info-strong)",
          pressed: "var(--color-info-pressed)"
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          strong: "var(--color-accent-strong)",
          pressed: "var(--color-accent-pressed)"
        },
        critical: {
          DEFAULT: "var(--color-critical)",
          strong: "var(--color-critical-strong)"
        },
        warning: {
          DEFAULT: "var(--status-warning)",
          strong: "var(--status-warning-strong)",
          surface: "var(--status-warning-surface)"
        },
        status: {
          info: {
            DEFAULT: "var(--status-info)",
            strong: "var(--status-info-strong)",
            surface: "var(--status-info-surface)",
            border: "var(--status-info-border)",
            on: "var(--status-info-on)"
          },
          success: {
            DEFAULT: "var(--status-success)",
            strong: "var(--status-success-strong)",
            surface: "var(--status-success-surface)",
            border: "var(--status-success-border)",
            on: "var(--status-success-on)"
          },
          warning: {
            DEFAULT: "var(--status-warning)",
            strong: "var(--status-warning-strong)",
            surface: "var(--status-warning-surface)",
            border: "var(--status-warning-border)",
            on: "var(--status-warning-on)"
          },
          danger: {
            DEFAULT: "var(--status-danger)",
            strong: "var(--status-danger-strong)",
            surface: "var(--status-danger-surface)",
            border: "var(--status-danger-border)",
            on: "var(--status-danger-on)"
          },
          private: {
            DEFAULT: "var(--status-private)",
            strong: "var(--status-private-strong)",
            surface: "var(--status-private-surface)",
            border: "var(--status-private-border)",
            on: "var(--status-private-on)"
          },
          neutral: {
            DEFAULT: "var(--status-neutral)",
            strong: "var(--status-neutral-strong)",
            surface: "var(--status-neutral-surface)",
            border: "var(--status-neutral-border)",
            on: "var(--status-neutral-on)"
          }
        },
        neutral: {
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)"
        },
        white: "var(--color-white)",
        black: "var(--color-black)"
      },
      textColor: {
        primary: "var(--text-primary)",
        inverse: "var(--text-inverse)",
        muted: "var(--text-muted)",
        "muted-strong": "var(--text-muted-strong)",
        subtle: "var(--text-subtle)",
        "status-info": "var(--status-info)",
        "status-info-on": "var(--status-info-on)",
        "status-success": "var(--status-success)",
        "status-success-on": "var(--status-success-on)",
        "status-warning": "var(--status-warning)",
        "status-warning-on": "var(--status-warning-on)",
        "status-danger": "var(--status-danger)",
        "status-danger-on": "var(--status-danger-on)",
        "status-private": "var(--status-private)",
        "status-private-on": "var(--status-private-on)",
        "status-neutral": "var(--status-neutral)",
        "status-neutral-on": "var(--status-neutral-on)"
      },
      backgroundColor: {
        surface: "var(--surface-base)",
        "surface-alt": "var(--surface-alt)",
        "surface-raised": "var(--surface-raised)",
        "surface-muted": "var(--surface-muted)",
        "overlay-strong": "var(--surface-overlay-strong)",
        "overlay-muted": "var(--surface-overlay-muted)",
        "overlay-panel": "var(--surface-overlay-panel)",
        "overlay-panel-soft": "var(--surface-overlay-panel-soft)",
        "overlay-panel-glass": "var(--surface-overlay-panel-glass)",
        "status-info-surface": "var(--status-info-surface)",
        "status-success-surface": "var(--status-success-surface)",
        "status-warning-surface": "var(--status-warning-surface)",
        "status-danger-surface": "var(--status-danger-surface)",
        "status-private-surface": "var(--status-private-surface)",
        "status-neutral-surface": "var(--status-neutral-surface)"
      },
      backgroundImage: {
        "overlay-header": "var(--surface-overlay-banner-gradient-header)",
        "overlay-channel": "var(--surface-overlay-banner-gradient-channel)"
      },
      borderColor: {
        surface: "var(--border-default)",
        "surface-strong": "var(--border-strong)",
        overlay: "var(--border-overlay)",
        "overlay-strong": "var(--border-overlay-strong)",
        "status-info-border": "var(--status-info-border)",
        "status-success-border": "var(--status-success-border)",
        "status-warning-border": "var(--status-warning-border)",
        "status-danger-border": "var(--status-danger-border)",
        "status-private-border": "var(--status-private-border)",
        "status-neutral-border": "var(--status-neutral-border)"
      },
      ringColor: {
        "status-danger": "var(--status-danger)",
        "status-warning": "var(--status-warning)",
        "status-info": "var(--status-info)",
        "status-success": "var(--status-success)"
      },
      ringOffsetColor: {
        surface: "var(--surface-base)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
        overlay: "var(--overlay-panel-radius)",
        "modal-xl": "var(--radius-modal-xl)",
        "sidebar-shell": "var(--radius-sidebar-shell)",
        "sidebar-panel": "var(--radius-sidebar-panel)",
        "sidebar-nav": "var(--radius-sidebar-nav)"
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        "overlay-panel": "var(--overlay-panel-shadow)",
        modal: "var(--shadow-modal)",
        "sidebar-shell": "var(--shadow-sidebar-shell)",
        "sidebar-accent": "var(--shadow-sidebar-accent)",
        "sidebar-trigger": "var(--shadow-sidebar-trigger)",
        "sidebar-dropup": "var(--shadow-sidebar-dropup)",
        "sidebar-panel": "var(--shadow-sidebar-panel)",
        "sidebar-focus-ring": "var(--shadow-sidebar-focus-ring)",
        "popover-intense": "0 22px 48px -18px var(--color-shadow-intense)"
      },
      boxShadowColor: {
        intense: "var(--color-shadow-intense)"
      },
      dropShadow: {
        intense: "0 1.5rem 3rem var(--color-shadow-intense)"
      },
      zIndex: {
        "overlay-nav": "var(--z-overlay-nav)",
        "overlay-floating": "var(--z-overlay-floating)",
        "overlay-popover": "var(--z-overlay-popover)",
        "overlay-toast": "var(--z-overlay-toast)"
      },
      spacing: {
        "4xs": "var(--space-4xs)",
        "3xs": "var(--space-3xs)",
        "2xs": "var(--space-2xs)",
        xs: "var(--space-xs)",
        "xs-snug": "var(--space-xs-snug)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        "md-plus": "var(--space-md-plus)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "xl-compact": "var(--space-xl-compact)",
        "xl-plus": "var(--space-xl-plus)",
        "2xl": "var(--space-2xl)",
        "2xl-plus": "var(--space-2xl-plus)",
        "sidebar-shell-inline": "var(--space-sidebar-shell-inline)",
        "sidebar-shell-block-start": "var(--space-sidebar-shell-block-start)",
        "sidebar-shell-block-end": "var(--space-sidebar-shell-block-end)",
        "sidebar-scroll-gap": "var(--space-sidebar-scroll-gap)",
        "sidebar-panel-gap": "var(--space-sidebar-panel-gap)",
        "sidebar-panel-padding-block":
          "var(--space-sidebar-panel-padding-block)",
        "sidebar-panel-padding-inline":
          "var(--space-sidebar-panel-padding-inline)",
        "sidebar-footer-gap": "var(--space-sidebar-footer-gap)",
        "sidebar-trigger-padding-block":
          "var(--space-sidebar-trigger-padding-block)",
        "sidebar-popover-offset": "var(--space-sidebar-popover-offset)",
        "sidebar-popover-padding-block":
          "var(--space-sidebar-popover-padding-block)",
        "sidebar-popover-padding-inline":
          "var(--space-sidebar-popover-padding-inline)",
        "sidebar-popover-gap": "var(--space-sidebar-popover-gap)",
        "sidebar-nav-padding-block": "var(--space-sidebar-nav-padding-block)",
        "sidebar-subnav-padding-block":
          "var(--space-sidebar-subnav-padding-block)",
        "sidebar-mobile-gutter": "var(--sidebar-mobile-gutter)",
        "popup-inline": "var(--popup-padding-inline)",
        "popup-block": "var(--popup-padding-block)",
        "overlay-panel-inline": "var(--overlay-panel-padding-inline)",
        "overlay-panel-block": "var(--overlay-panel-padding-block)"
      },
      height: {
        "modal-embed": "var(--modal-embed-height)"
      },
      minHeight: {
        "modal-pane": "var(--modal-pane-min-height)",
        "status-log": "var(--status-log-min-height)"
      },
      minWidth: {
        menu: "var(--menu-min-width)",
        "grid-card": "var(--grid-card-min-width)"
      },
      maxWidth: {
        modal: "var(--modal-max-width)",
        player: "var(--layout-player-max-width)",
        docs: "var(--layout-docs-max-width)",
        "popover-safe": "var(--popover-inline-safe-max)"
      },
      translate: {
        toast: "var(--toast-translate)"
      },
      backdropBlur: {
        popover: "var(--popover-backdrop-blur)"
      },
      fontFamily: {
        sans: ["var(--font-family-sans)"],
        mono: ["var(--font-family-mono)"]
      },
      fontSize: {
        "4xs": [
          "var(--font-size-4xs)",
          { lineHeight: "var(--line-height-tight)" }
        ],
        "3xs": [
          "var(--font-size-3xs)",
          { lineHeight: "var(--line-height-tight)" }
        ],
        "2xs": [
          "var(--font-size-2xs)",
          { lineHeight: "var(--line-height-tight)" }
        ],
        xs: ["var(--font-size-xs)", { lineHeight: "var(--line-height-tight)" }],
        sm: ["var(--font-size-sm)", { lineHeight: "var(--line-height-snug)" }],
        base: [
          "var(--font-size-base)",
          { lineHeight: "var(--line-height-base)" }
        ],
        lg: ["var(--font-size-lg)", { lineHeight: "var(--line-height-base)" }],
        xl: [
          "var(--font-size-xl)",
          { lineHeight: "var(--line-height-relaxed)" }
        ],
        "2xl": [
          "var(--font-size-2xl)",
          { lineHeight: "var(--line-height-relaxed)" }
        ]
      },
      transitionDuration: {
        fast: "var(--motion-duration-fast)",
        base: "var(--motion-duration-base)",
        slow: "var(--motion-duration-slow)"
      },
      letterSpacing: {
        "extra-wide": "var(--tracking-extra-wide)"
      },
      maxHeight: {
        "modal-shell": "var(--modal-shell-max-height)",
        "modal-sheet": "var(--modal-sheet-max-height)",
        "modal-body": "var(--modal-body-max-height)",
        "modal-pane": "var(--modal-pane-max-height)",
        "modal-embed": "var(--modal-embed-height)",
        "profile-history": "var(--profile-history-max-height)"
      },
      transitionTimingFunction: {
        "ease-out": "var(--motion-ease-out)",
        "ease-in-out": "var(--motion-ease-in-out)"
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": "var(--color-text)",
            "--tw-prose-headings": "var(--color-text-strong)",
            "--tw-prose-links": "var(--color-primary)",
            "--tw-prose-bold": "var(--color-text-strong)",
            "--tw-prose-hr": "var(--color-border-subtle)",
            "--tw-prose-quotes": "var(--color-muted)",
            "--tw-prose-counters": "var(--color-text-muted)",
            "--tw-prose-bullets": "var(--color-text-muted)",
            "--tw-prose-code": "var(--color-secondary)",
            "--tw-prose-th-borders": "var(--color-border-subtle)",
            "--tw-prose-td-borders": "var(--color-border-subtle)",
            color: "var(--color-text)",
            lineHeight: "1.6",
            maxWidth: "none",
            fontFamily: theme("fontFamily.sans").join(", "),
            h1: {
              fontWeight: theme("fontWeight.bold"),
              marginTop: "0.5rem",
              marginBottom: "1rem",
              fontSize: theme("fontSize.2xl")[0]
            },
            h2: {
              fontWeight: theme("fontWeight.bold"),
              marginTop: "1.25rem",
              marginBottom: "0.75rem",
              fontSize: theme("fontSize.xl")[0]
            },
            h3: {
              fontWeight: theme("fontWeight.semibold"),
              marginTop: "1rem",
              marginBottom: "0.75rem",
              fontSize: theme("fontSize.lg")[0]
            },
            "h4, h5, h6": {
              fontWeight: theme("fontWeight.semibold"),
              marginTop: "0.75rem",
              marginBottom: "0.5rem"
            },
            p: {
              marginTop: "0",
              marginBottom: "1rem"
            },
            "ul, ol": {
              marginTop: "0",
              marginBottom: "1rem",
              paddingLeft: "1.25rem"
            },
            li: {
              marginTop: "0.5rem",
              marginBottom: "0.5rem"
            },
            blockquote: {
              borderLeftWidth: "4px",
              borderLeftColor: "var(--color-border-subtle)",
              paddingLeft: "1rem",
              marginTop: "1rem",
              marginBottom: "1rem",
              color: "var(--color-muted)"
            },
            code: {
              backgroundColor: "var(--color-page-alt)",
              color: "var(--color-secondary)",
              padding: "0.2rem 0.4rem",
              borderRadius: theme("borderRadius.md"),
              fontFamily: theme("fontFamily.mono").join(", "),
              fontSize: theme("fontSize.sm")[0],
              fontWeight: theme("fontWeight.medium")
            },
            "code::before": {
              content: "none"
            },
            "code::after": {
              content: "none"
            },
            pre: {
              backgroundColor: "var(--color-page-alt)",
              color: "var(--color-text-strong)",
              padding: "1rem",
              borderRadius: theme("borderRadius.md"),
              overflowX: "auto",
              marginTop: "0",
              marginBottom: "1rem",
              fontFamily: theme("fontFamily.mono").join(", "),
              fontSize: theme("fontSize.sm")[0]
            },
            "pre code": {
              backgroundColor: "transparent",
              padding: "0",
              borderRadius: "0",
              fontWeight: "inherit",
              color: "inherit"
            },
            a: {
              color: "var(--color-primary)",
              textDecoration: "none",
              fontWeight: theme("fontWeight.medium")
            },
            "a:hover": {
              textDecoration: "underline"
            },
            hr: {
              borderColor: "var(--color-border-subtle)",
              borderTopWidth: "1px",
              marginTop: "2rem",
              marginBottom: "2rem"
            },
            img: {
              marginTop: "0",
              marginBottom: "1rem",
              borderRadius: theme("borderRadius.md"),
              maxWidth: "100%",
              height: "auto"
            }
          }
        }
      })
    }
  },
  plugins: [typography]
};
