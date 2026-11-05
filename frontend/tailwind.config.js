/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00248b',
          container: '#1a3bb0',
          fixed: '#dde1ff',
          'fixed-dim': '#b8c3ff',
        },
        'on-primary': '#ffffff',
        'on-primary-container': '#a4b3ff',
        secondary: {
          DEFAULT: '#495e89',
          container: '#b6ccfd',
          fixed: '#d8e2ff',
        },
        'on-secondary': '#ffffff',
        'on-secondary-container': '#405680',
        surface: {
          DEFAULT: '#f9f9ff',
          dim: '#d3daea',
          bright: '#f9f9ff',
          container: '#e7eefe',
          'container-low': '#eff3ff',
          'container-lowest': '#ffffff',
          'container-high': '#e1e8f8',
          'container-highest': '#dce3f2',
          variant: '#dce3f2',
          white: '#FFFEFF',
        },
        'on-surface': '#151c27',
        'on-surface-variant': '#444653',
        'text-secondary': '#4A5F7E',
        'prussian-blue': '#0B2545',
        'persian-blue': '#1A3BB0',
        lavender: '#E6EDFD',
        periwinkle: '#AFC5F6',
        outline: {
          DEFAULT: '#757685',
          variant: '#c5c5d6',
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        'on-error': '#ffffff',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      }
    },
  },
  plugins: [],
}
