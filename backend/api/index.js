const serverless = require('serverless-http');
const app = require('../app'); // adjust the path if your main file has a different name

module.exports.handler = serverless(app);