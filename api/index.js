const serverless = require('serverless-http');
const app = require('../backend/src/app');   // ✅ correct path if app.js is inside backend/src

module.exports.handler = serverless(app);