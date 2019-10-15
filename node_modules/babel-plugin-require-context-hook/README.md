# babel-plugin-require-context-hook

## Usage

babelrc:

```
"plugins": [
	"require-context-hook"
]
```

Wherever you configure babel-register (your source file, a register script, etc):

```
require('babel-plugin-require-context-hook/register')();
```

## How it works

The register script `babel-plugin-require-context-hook/register` implements the function `require.context` with an extra parameter-- the directory in which the calling file resides-- and places that function on the global scope.

The Babel plugin `babel-plugin-require-context-hook` rewrites all calls to `require.context` into calls to this global function, passing in `__dirname` as the extra parameter.
