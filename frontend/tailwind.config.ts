import type { Config } from "tailwindcss";

// Mapeia os tokens da marca Megus (paleta do Manual de Identidade v2) para as
// CSS vars HSL consumidas pelos componentes shadcn/ui. Ver `src/index.css`.
//
// Além dos semânticos do shadcn, expomos as três famílias da marca —
// `menta` (deu certo), `terra` (precisa de humano) e `areia` (base quente) —
// para que uma tela nunca precise escrever hex.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        brand: ["Sora", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          light: "hsl(var(--primary-light))",
          muted: "hsl(var(--primary-muted))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ── marca ──
        menta: {
          DEFAULT: "hsl(var(--menta))",
          dark: "hsl(var(--menta-dark))",
          soft: "hsl(var(--menta-soft))",
          ink: "hsl(var(--menta-ink))",
        },
        terra: {
          DEFAULT: "hsl(var(--terra))",
          dark: "hsl(var(--terra-dark))",
          soft: "hsl(var(--terra-soft))",
          ink: "hsl(var(--terra-ink))",
        },
        areia: {
          DEFAULT: "hsl(var(--areia))",
          soft: "hsl(var(--areia-soft))",
        },
        gesto: {
          DEFAULT: "hsl(var(--gesto))",
          inv: "hsl(var(--gesto-inv))",
        },

        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--info-soft))",
        },
        whatsapp: "hsl(var(--whatsapp))",
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 3px)",
        sm: "calc(var(--radius) - 5px)",
      },
      boxShadow: {
        sutil: "0 1px 2px rgba(37,40,38,.05)",
        media: "0 6px 18px rgba(37,40,38,.09)",
        alta: "0 14px 40px rgba(37,40,38,.20)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
