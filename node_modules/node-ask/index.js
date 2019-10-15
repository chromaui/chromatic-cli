/* jslint esversion: 6 */
const cin = process.stdin;
const cout = process.stdout;
const fnList = {
  prompt: pprompt,
  confirm: pconfirm,
  multiline: pmultiline
};


// Public functions
function ask(questions) {
  "use strict";
  let answers = {};
  let i = 0;

  return new Promise(function(resolve, reject) {
    function askQuestion(item) {
      let key = item.key;
      let msg = item.msg;
      let fn = fnList[item.fn];
      if (!key) {
        throw new Error('A value for `key` must be defined for question '+i);
      }
      if (!msg) {
        throw new Error('A value for `msg` must be defined for question '+i);
      }
      if (!fn) {
        throw new Error('A value for `fn` must be "prompt", "confirm", or "multiline" for question '+i);
      }

      if (fn) {
        fn(msg, key, answers).then(
          function() {
            next();
          }
        );
      }
    }

    function next() {
      if (i < questions.length) {
        var question = questions[i];
        i++;
        askQuestion(question);
      }
      else {
        resolve(answers);
      }
    }

    next();
  });
}

function prompt(msg, multiLine){
  "use strict";
  return new Promise(function(resolve) {
    cout.write(msg);
    cin.setEncoding('utf8');
    if (multiLine) {
      let buf = [];
      cout.write('\n');
      cin.on('data',
        function(val){
          if ('\n' == val || '\r\n' == val) {
            cin.pause();
            cin.removeAllListeners('data');
            resolve(buf.join('\n'));
            buf = null;
          } else {
            buf.push(val.slice(0,-1));
          }
        }
      ).resume();
    }
    else {
      cin.once('data',
        function(val){
          cin.pause();
          resolve(val.slice(0,-1));
        }
      ).resume();
    }
  });
}

function confirm(msg) {
  "use strict";
  return prompt(msg, false).then(
    function(val) {
      return(/^y|yes|ok|true$/i.test(val));
    }
  );
}

function multiline(msg) {
  "use strict";
  return prompt(msg, true);
}

// Private functions
function promiseFn(msg, key, answers, fn) {
  "use strict";
  answers = answers || {};
  return fn(msg).then(
    function(resp) {
      answers[key] = resp;
      return answers;
    }
  );
}

function pprompt(msg, key, answers) {
  return promiseFn(msg, key, answers, prompt);
}

function pconfirm(msg, key, answers) {
  return promiseFn(msg, key, answers, confirm);
}

function pmultiline(msg, key, answers) {
  return promiseFn(msg, key, answers, multiline);
}

module.exports = {
  ask,
  confirm,
  multiline,
  prompt
};
