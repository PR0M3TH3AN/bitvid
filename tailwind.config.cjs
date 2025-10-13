module.exports = {
  content: [
    "./index.html",
    "./blog.html",
    "./components/**/*.html",
    "./views/**/*.html",
    "./js/**/*.js"
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
        black: "var(--color-black)",
        blog: {
          transparent: "var(--color-blog-transparent)",
          "cyan-500": "var(--color-blog-cyan-500)",
          "sky-500": "var(--color-blog-sky-500)",
          "teal-600": "var(--color-blog-teal-600)",
          "green-800": "var(--color-blog-green-800)",
          "green-700": "var(--color-blog-green-700)",
          "teal-700": "var(--color-blog-teal-700)",
          "gray-900": "var(--color-blog-gray-900)",
          "coffee-900": "var(--color-blog-coffee-900)",
          "green-500": "var(--color-blog-green-500)",
          "gray-800": "var(--color-blog-gray-800)",
          "gray-700": "var(--color-blog-gray-700)",
          "teal-accent": "var(--color-blog-teal-accent)",
          "gray-650": "var(--color-blog-gray-650)",
          "brown-700": "var(--color-blog-brown-700)",
          "purple-900": "var(--color-blog-purple-900)",
          "gray-500": "var(--color-blog-gray-500)",
          "gray-450": "var(--color-blog-gray-450)",
          "gray-440": "var(--color-blog-gray-440)",
          "brown-500": "var(--color-blog-brown-500)",
          "rust-700": "var(--color-blog-rust-700)",
          "purple-700": "var(--color-blog-purple-700)",
          "purple-accent": "var(--color-blog-purple-accent)",
          "purple-muted": "var(--color-blog-purple-muted)",
          "gray-300": "var(--color-blog-gray-300)",
          "purple-500": "var(--color-blog-purple-500)",
          "gray-275": "var(--color-blog-gray-275)",
          "red-600": "var(--color-blog-red-600)",
          "rust-600": "var(--color-blog-rust-600)",
          error: "var(--color-blog-error)",
          "gray-220": "var(--color-blog-gray-220)",
          "gray-210": "var(--color-blog-gray-210)",
          "gray-200": "var(--color-blog-gray-200)",
          "amber-500": "var(--color-blog-amber-500)",
          "gray-190": "var(--color-blog-gray-190)",
          "orange-600": "var(--color-blog-orange-600)",
          "gray-180": "var(--color-blog-gray-180)",
          "gray-170": "var(--color-blog-gray-170)",
          "red-500": "var(--color-blog-red-500)",
          "amber-400": "var(--color-blog-amber-400)",
          "neutral-100": "var(--color-blog-neutral-100)",
          "neutral-120": "var(--color-blog-neutral-120)",
          "orange-500": "var(--color-blog-orange-500)",
          "neutral-50": "var(--color-blog-neutral-50)"
        }
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
      }
    }
  },
  plugins: []
};
