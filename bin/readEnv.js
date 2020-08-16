const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

const myEnv = dotenv.config();
dotenvExpand(myEnv);
