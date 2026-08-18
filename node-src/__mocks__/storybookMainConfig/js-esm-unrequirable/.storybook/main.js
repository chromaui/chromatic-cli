// The missing import makes `require()` of this config throw on every supported Node, with or
// without `require(esm)`, so this fixture always takes the AST fallback.
import 'chromatic-fixture-missing-package';

export default { staticDirs: ['./static', '../public'] };
