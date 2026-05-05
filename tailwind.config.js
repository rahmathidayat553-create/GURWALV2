/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5', // Indigo 600
        secondary: '#6366F1', // Indigo 500
        danger: '#EF4444', // Red 500
        success: '#10B981', // Emerald 500
        dark: {
          bg: '#111827', // Gray 900
          surface: '#1F2937', // Gray 800
          border: '#374151', // Gray 700
          text: '#F3F4F6', // Gray 100
          muted: '#9CA3AF', // Gray 400
        }
      },
      animation: {
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'slide-in': 'slideIn 0.3s ease-out'
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        }
      }
    }
  },
  plugins: [],
}
