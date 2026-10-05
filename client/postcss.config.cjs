module.exports = {
  plugins: {
    tailwindcss: { config: pathJoinConfig() },
    autoprefixer: {},
  },
};

function pathJoinConfig() {
  const path = require('path');
  return path.join(__dirname, 'tailwind.config.cjs');
}
