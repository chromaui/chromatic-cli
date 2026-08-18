// A cjs config that nests its fields under `default`, the shape `require()` gives back for an ESM
// config. `require()` of this file succeeds on every supported Node, so the reader's `default`
// unwrap is exercised regardless of whether the runtime has `require(esm)`.
module.exports = { default: { staticDirs: ['./static', '../public'] } };
