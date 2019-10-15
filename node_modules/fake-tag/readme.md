# fake-tag

[![npm version](https://img.shields.io/npm/v/fake-tag.svg)](https://npm.im/fake-tag) ![Licence](https://img.shields.io/npm/l/fake-tag.svg) [![Github issues](https://img.shields.io/github/issues/jaydenseric/fake-tag.svg)](https://github.com/jaydenseric/fake-tag/issues) [![Github stars](https://img.shields.io/github/stars/jaydenseric/fake-tag.svg)](https://github.com/jaydenseric/fake-tag/stargazers) [![Travis status](https://img.shields.io/travis/jaydenseric/fake-tag.svg)](https://travis-ci.org/jaydenseric/fake-tag)

A fake template literal tag to trick linters and formatters into action. Interpolations and escapes are tested.

This hack will be redundant once comment tags are supported by tools [such as Prettier](https://github.com/prettier/prettier/issues/4360):

<!-- prettier-ignore -->
```js
/* GraphQL */`
  {
    foo
  }
`
```

## Install

Install with [npm](https://npmjs.com):

```sh
npm install fake-tag
```

## Usage

Import and use the tag with the required name:

```js
import gql from 'fake-tag'

const typeDefs = gql`
  "A foo."
  type Foo {
    "The \`Foo\` ID."
    id: ID!
  }
`
```

## Why not `String.raw`?

It doesn’t unescape characters. For the usage example, if you `console.log(typeDefs)` before and after replacing the import with`const gql = String.raw` you will see the difference in the type description markdown:

```diff
    "A foo."
    type Foo {
-     "The `Foo` ID."
+     "The \`Foo\` ID."
      id: ID!
    }
```
