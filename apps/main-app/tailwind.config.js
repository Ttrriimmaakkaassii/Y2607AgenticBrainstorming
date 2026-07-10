/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          bg: '#f0f2f5',
          bubble: '#dcf8c6',
          userBubble: '#95ec69',
          accent: '#3b99fc',
          green: '#25d366',
        },
      },
    },
  },
  plugins: [],
};
