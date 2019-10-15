node-ask
====

## A simple, Promise based, keyboard input system for node.js

`node-ask` provides a simple set of functions to allow a node.js application to ask a question and get keyboard input for a response.

> **`node-ask` requires a version of node that supports native Promises. That is version 4.0 or greater or you can use version 0.12 with the `--harmony` flag turned on.**

<br/><br/>
## Basic Functions

The three basic functions of `node-ask` are:

| Function | Description |
|---|---|
| `prompt(<message>)` | Output the `<message>` to stdout and wait for keyboard input from stdin. When the user pressed the `RETURN` key `prompt` will resolve with whatever the user entered minus the `RETURN` key |
| `multiline(<message>)` | Output the `<message>` to stdout and wait for keyboard input from stdin. When the user pressed the `RETURN` key on a blank line `multiline` will resolve with whatever the user entered minus the last `RETURN` key|
| `confirm(<message>)` |  Output the `<message>` to stdout and wait for keyboard input from stdin. When the user pressed the `RETURN` key, if the keyboard input was `y`, `yes`, `okay` or `true` then `confirm` will resolve with `true` otherwise it will resolve with `false`. |


Examples:

```JavaScript
const prompt = require('node-ask').prompt;
const confirm = require('node-ask').confirm;
const multiline = require('node-ask').multiline;

prompt('What is your name? ').then(
  function(answer) {
    console.log('Your name is', answer);
    return confirm('Are you living? ');
  }
).then(
  function(answer) {
    console.log('You '+(answer?'are':'are not')+' living');
    return multiline('Describe yourself:');
  }
).then(
  function(answer) {
    console.log('You described yourself as:', answer);
  }
);
```

## Asking multiple questions in one call

`node-ask` allows for a single Promise based function to ask the user several questions through one call instead of having to make a separate call per question.

### `ask(<questions>)`


The `ask` function takes `<questions>`, an array of objects, to indicate the series of questions to ask and what type of function should be used per question. Each object in the array also defines the property name to be used in the resolved `answer` object that will contain the user's responses.

While `prompt`, `confirm` and `multiline` always `resolve` their promises, `ask` will resolve its promise unless there is an error in the format of your `<questions>` array. So it is important that you use `.catch` anytime you call `ask`.


```JavaScript
var questions = [
  { key: 'name',   msg: 'What is your name? ',       fn: 'prompt' },
  { key: 'living', msg: 'Are you living? ',          fn: 'confirm' },
  { key: 'age',    msg: 'How old are you? ',         fn: 'prompt' },
  { key: 'hair',   msg: 'What color is your hair? ', fn: 'prompt' },
  { key: 'big',    msg: 'Give us a description:',    fn: 'multiline' }
];

nodeAsk.ask(questions).then(
  function(answers) {
    console.log(JSON.stringify(answers,0,2));
  }
).catch(
  function(ex) {
    // Do your error management here
    console.log(ex.stack);
  }
);
```

Based on the `<questions>` array in the above example the answers object that is resolved by ask will look like this:

```JavaScript
answers = {
  name: <string>,
  living: <boolean>,
  age: <string>,
  hair: <string>,
  big: <multi-lined string>
};
```

`<questions>` is an array of objects that must contain all of the following parameters:

| Property | Description |
|---|---|
| key | The name of the property, in the answers object, to use for storing the user entered response. |
| msg | The message to output before waiting for the user to respond. |
| fn | The type of function you want called.<br/><br>Valid values are:<br>`'prompt'`, `'confirm'`, or `'mulitline'`

## License:
[MIT](./LICENSE.md)