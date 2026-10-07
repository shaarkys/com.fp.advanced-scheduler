const path = require('path');

module.exports = {
  outputDir: path.resolve(__dirname, '../settings'),
  publicPath: './',
  transpileDependencies: [
    'vuetify'
  ],
  css: {
    loaderOptions: {
        sass: {
            additionalData: '@import "@/styles/main.scss"',
            sassOptions: {
                // Vuetify 2 still uses the legacy Sass syntax and API.
                silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions', 'slash-div', 'if-function']
            }
        }
    }
  },
};
