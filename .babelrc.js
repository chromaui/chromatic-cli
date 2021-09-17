module.exports = {
  env: {
    test: {
      presets: [
        '@babel/preset-typescript',
        ['@babel/preset-env', { targets: { node: 'current' } }],
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
