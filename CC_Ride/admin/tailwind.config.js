/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Corporate Transit Excellence — Trust Blue ──────────────────────
        brand: {
          50:  '#EBF3FF',  // ice blue — chip/badge bg
          100: '#D6E8FF',  // soft borders
          200: '#A9C7FF',  // inverse-primary
          300: '#6FA8FF',
          400: '#3D8EFF',
          500: '#1565C0',  // primary-container — main CTA
          600: '#004D99',  // primary — deep trust blue
          700: '#003A75',  // pressed / hover
          800: '#002655',
          900: '#001640',
          950: '#0A1628',  // sidebar bg
        },
        surface: {
          DEFAULT: '#F6F9FE',  // page background
          low:     '#F1F4F9',  // table stripe
          mid:     '#EBEEF3',  // card inner
          high:    '#E5E8ED',
          border:  '#DFE3E8',  // dividers
        },
        ink: {
          DEFAULT: '#181C20',  // primary text
          muted:   '#424752',  // secondary
          subtle:  '#727783',  // placeholder
          ghost:   '#C2C6D4',  // disabled
        },
        // Backwards-compat aliases
        navy: {
          DEFAULT: '#181C20',
          light:   '#424752',
          mist:    '#727783',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm:      '4px',
        DEFAULT: '8px',
        md:      '12px',   // buttons, inputs, tags
        lg:      '16px',   // cards
        xl:      '24px',   // sheets / large modals
        full:    '9999px',
      },
      boxShadow: {
        // Use CSS-var values so both @apply and className= work correctly
        card:       'var(--shadow-card,  0px 4px 12px rgba(21,101,192,0.08))',
        modal:      'var(--shadow-modal, 0px 8px 24px rgba(21,101,192,0.12))',
        'brand-sm': 'var(--shadow-sm,   0px 1px 4px  rgba(21,101,192,0.06))',
        brand:      'var(--shadow-modal, 0px 8px 24px rgba(21,101,192,0.12))',
        'brand-lg': '0px 12px 32px rgba(21,101,192,0.16)',
      },
      spacing: {
        13: '3.25rem',  // 52px — button / input height
        18: '4.5rem',
      },
    },
  },
  plugins: [],
}
