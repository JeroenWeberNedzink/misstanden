/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        primary: {
          DEFAULT: 'var(--color-primary)', // blue-900
          foreground: 'var(--color-primary-foreground)' // white
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)', // gray-700
          foreground: 'var(--color-secondary-foreground)' // white
        },
        accent: {
          DEFAULT: 'var(--color-accent)', // emerald-600
          foreground: 'var(--color-accent-foreground)' // white
        },
        destructive: {
          DEFAULT: 'var(--color-destructive)', // red-600
          foreground: 'var(--color-destructive-foreground)' // white
        },
        success: {
          DEFAULT: 'var(--color-success)', // emerald-500
          foreground: 'var(--color-success-foreground)' // white
        },
        warning: {
          DEFAULT: 'var(--color-warning)', // amber-500
          foreground: 'var(--color-warning-foreground)' // gray-800
        },
        error: {
          DEFAULT: 'var(--color-error)', // red-600
          foreground: 'var(--color-error-foreground)' // white
        },
        muted: {
          DEFAULT: 'var(--color-muted)', // gray-100
          foreground: 'var(--color-muted-foreground)' // gray-700
        },
        card: {
          DEFAULT: 'var(--color-card)', // white
          foreground: 'var(--color-card-foreground)' // gray-800
        },
        popover: {
          DEFAULT: 'var(--color-popover)', // white
          foreground: 'var(--color-popover-foreground)' // gray-800
        }
      },
      borderRadius: {
        sm: 'var(--radius-sm)', // 6px
        md: 'var(--radius-md)', // 12px
        lg: 'var(--radius-lg)', // 18px
        xl: 'var(--radius-xl)' // 24px
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
        caption: ['Karla', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.4' }],
        'sm': ['0.875rem', { lineHeight: '1.4' }],
        'base': ['1rem', { lineHeight: '1.6' }],
        'lg': ['1.125rem', { lineHeight: '1.5' }],
        'xl': ['1.25rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.3' }],
        '3xl': ['1.875rem', { lineHeight: '1.25' }],
        '4xl': ['2.25rem', { lineHeight: '1.2' }]
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem'
      },
      boxShadow: {
        'sm': '0 1px 3px 0 var(--shadow-color)',
        'DEFAULT': '0 1px 3px 0 var(--shadow-color), 0 1px 2px -1px var(--shadow-color)',
        'md': '0 4px 6px -1px var(--shadow-color-md), 0 2px 4px -2px var(--shadow-color-md)',
        'lg': '0 10px 15px -3px var(--shadow-color-lg), 0 4px 6px -4px var(--shadow-color-lg)',
        'xl': '0 20px 25px -5px var(--shadow-color-lg), 0 8px 10px -6px var(--shadow-color-lg)'
      },
      transitionDuration: {
        '250': '250ms'
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100'
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' }
        }
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms')
  ]
}