// vue.config.js
const path = require('path')

// pdf.js worker and runtime assets (cmaps, fonts, wasm decoders, color profiles, icons) are copied as-is,
// under js/, which the server serves with a long cache (WebMvcConfiguration),
// in a versioned folder so that a pdf.js upgrade never mixes with cached files
const pdfjsPackage = require.resolve('pdfjs-dist/package.json')
const pdfjsDist = path.dirname(pdfjsPackage)
// also read by src/functions/pdfjs.ts
process.env.VUE_APP_PDFJS_ASSETS = `js/pdfjs-${require(pdfjsPackage).version}/`

module.exports = {
  // with './' the dev server cannot load any arbitrary path
  // with '/' the prod build generates some url(/fonts…) calls in the css chunks, which doesn't work with a servlet context path
  publicPath: process.env.NODE_ENV === 'production' ? './' : '/',

  pluginOptions: {
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      localeDir: 'locales',
      enableInSFC: false,
    },
  },

  devServer: {
    allowedHosts: 'all',
    client: {
      webSocketURL: 'ws://0.0.0.0:8081/ws',
    },
  },

  chainWebpack: config => {
    // pdf.js types need TypeScript >= 5.7, the aliases make TypeScript use src/shims-pdfjs.d.ts instead
    config.resolve.alias
      .set('pdfjs-lib$', 'pdfjs-dist/legacy/build/pdf.mjs')
      .set('pdfjs-viewer$', 'pdfjs-dist/legacy/web/pdf_viewer.mjs')

    config.plugin('copy').tap(([options]) => {
      options.patterns.push(
        ...[
          {from: 'legacy/build/pdf.worker.min.mjs', to: ''},
          {from: 'cmaps', to: 'cmaps/'},
          {from: 'standard_fonts', to: 'standard_fonts/'},
          // quickjs runs the JavaScript embedded in PDF files, which is never enabled
          {from: 'wasm', to: 'wasm/', globOptions: {ignore: ['**/quickjs-eval.*']}},
          {from: 'iccs', to: 'iccs/'},
          // icons of the text annotations
          {from: 'legacy/web/images/annotation-*.svg', to: 'images/[name][ext]'},
        ].map(pattern => ({
          ...pattern,
          from: `${pdfjsDist}/${pattern.from}`,
          to: `${process.env.VUE_APP_PDFJS_ASSETS}${pattern.to}`,
          // copied as-is: terser skips the worker, already minified, instead of minifying it again
          info: {
            minimized: true,
          },
        })),
      )
      return [options]
    })
  },

  // custom rule for readium and r2d2bc css that needs to be made available, but untouched
  configureWebpack: {
    module: {
      rules: [
        {
          test: [
            /readium\/.*\.css.resource$/,
            /r2d2bc\/.*\.css.resource$/,
          ],
          type: 'asset/resource',
          generator: {
            filename: 'css/[hash].css[query]',
          },
        },
      ],
    },
  },
}
