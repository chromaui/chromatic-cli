/**
 * The `importMeta` option every `meow()` call needs. meow uses its `url` to find chromatic's own
 * package.json, which supplies `--version`.
 *
 * We bundle to CJS, where `import.meta` itself becomes `{}`, but tsdown's `shims` turns
 * `import.meta.url` into the bundle's file URL. So pass only `url`.
 */
export const meowImportMeta = { url: import.meta.url } as ImportMeta;
