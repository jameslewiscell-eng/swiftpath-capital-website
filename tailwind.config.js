/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './loans/*.html',
    './assets/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#4A7A9D',
        'brand-blue-dark': '#3b627e',
        'brand-gold': '#c5a35a',
        'brand-gold-dark': '#a2864a',
      },
    },
  },
  plugins: [],
};
