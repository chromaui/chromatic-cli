module.exports = {
  env: {
    test: {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
      ],
      plugins: [
        'require-context-hook'
      ],
    },
    build: {
      comments: false,
      presets: [
        '@babel/env',
        'minify',
      ],
      plugins: [
        '@babel/plugin-proposal-object-rest-spread',
        '@babel/transform-runtime',
      ],
    }
  },
}
