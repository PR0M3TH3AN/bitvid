const typography = require("@tailwindcss/typography");

module.exports = {
  content: [
    "./index.html",
    "./blog.html",
    "./components/**/*.html",
    "./views/**/*.html",
    "./js/**/*.js",
    "./torrent/**/*.html",
    "./torrent/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--color-page)",
        "page-alt": "var(--color-page-alt)",
        surface: "var(--color-surface)",
        "surface-alt": "var(--color-surface-alt)",
        overlay: {
          DEFAULT: "var(--color-overlay)",
          muted: "var(--color-overlay-muted)",
          strong: "var(--color-overlay-strong)",
          darker: "var(--color-overlay-darker)",
          veil: "var(--color-overlay-veil)",
          banner: "var(--color-overlay-banner)",
          panel: "var(--color-overlay-panel)",
          "panel-soft": "var(--color-overlay-panel-soft)",
          "panel-tint": "var(--color-overlay-panel-tint)",
          "panel-glass": "var(--color-overlay-panel-glass)",
          black: "var(--color-overlay-black)"
        },
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        panel: {
          DEFAULT: "var(--color-panel)",
          hover: "var(--color-panel-hover)"
        },
        card: {
          DEFAULT: "var(--color-card)",
          private: "var(--color-card-private)",
          critical: "var(--color-card-critical)"
        },
        border: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
          translucent: "var(--color-border-translucent)",
          "translucent-strong": "var(--color-border-translucent-strong)",
          "translucent-bright": "var(--color-border-translucent-bright)",
          "translucent-medium": "var(--color-border-translucent-medium)",
          "translucent-stronger": "var(--color-border-translucent-stronger)",
          "translucent-strongest": "var(--color-border-translucent-strongest)",
          "translucent-glow": "var(--color-border-translucent-glow)",
          "info-soft": "var(--color-border-info-soft)",
          "neutral-soft": "var(--color-border-neutral-soft)",
          "sidebar-strong": "var(--color-border-sidebar-strong)"
        },
        text: {
          DEFAULT: "var(--color-text)",
          strong: "var(--color-text-strong)",
          muted: "var(--color-muted)",
          frosted: "var(--color-text-frosted)",
          "frosted-strong": "var(--color-text-frosted-strong)",
          "frosted-soft": "var(--color-text-frosted-soft)"
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
        critical: {
          DEFAULT: "var(--color-critical)",
          strong: "var(--color-critical-strong)"
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          strong: "var(--color-warning-strong)",
          surface: "var(--color-warning-surface)"
        },
        neutral: {
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)"
        },
        white: "var(--color-white)",
        black: "var(--color-black)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)"
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        modal: "var(--shadow-modal)"
      },
      spacing: {
        "2xs": "var(--space-2xs)",
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)"
      },
      fontFamily: {
        sans: ["var(--font-family-sans)"],
        mono: ["var(--font-family-mono)"]
      },
      fontSize: {
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
      transitionTimingFunction: {
        "ease-out": "var(--motion-ease-out)",
        "ease-in-out": "var(--motion-ease-in-out)"
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": "var(--color-text-strong)",
            "--tw-prose-headings": "var(--color-text-strong)",
            "--tw-prose-links": "var(--color-primary)",
            "--tw-prose-bold": "var(--color-text-strong)",
            "--tw-prose-hr": "var(--color-border-subtle)",
            "--tw-prose-quotes": "var(--color-muted)",
            "--tw-prose-counters": "var(--color-text-strong)",
            "--tw-prose-bullets": "var(--color-border-subtle)",
            "--tw-prose-code": "var(--color-secondary)",
            "--tw-prose-th-borders": "var(--color-border-subtle)",
            "--tw-prose-td-borders": "var(--color-border-subtle)",
            color: "var(--color-text-strong)",
            lineHeight: "1.6",
            maxWidth: "none",
            fontFamily: theme("fontFamily.sans").join(", "),
            "h1": {
              fontWeight: theme("fontWeight.bold"),
              marginTop: "0.5rem",
              marginBottom: "1rem",
              fontSize: theme("fontSize.2xl")[0]
            },
            "h2": {
              fontWeight: theme("fontWeight.bold"),
              marginTop: "1.25rem",
              marginBottom: "0.75rem",
              fontSize: theme("fontSize.xl")[0]
            },
            "h3": {
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
            "p": {
              marginTop: "0",
              marginBottom: "1rem"
            },
            "ul, ol": {
              marginTop: "0",
              marginBottom: "1rem",
              paddingLeft: "1.25rem"
            },
            "li": {
              marginTop: "0.5rem",
              marginBottom: "0.5rem"
            },
            "blockquote": {
              borderLeftWidth: "4px",
              borderLeftColor: "var(--color-border-subtle)",
              paddingLeft: "1rem",
              marginTop: "1rem",
              marginBottom: "1rem",
              color: "var(--color-muted)"
            },
            "code": {
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
            "pre": {
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
            "a": {
              color: "var(--color-primary)",
              textDecoration: "none",
              fontWeight: theme("fontWeight.medium")
            },
            "a:hover": {
              textDecoration: "underline"
            },
            "hr": {
              borderColor: "var(--color-border-subtle)",
              borderTopWidth: "1px",
              marginTop: "2rem",
              marginBottom: "2rem"
            },
            "img": {
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
