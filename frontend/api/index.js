import serverless from 'serverless-http';
import app from '../../backend/src/app.js'; // include .js extension

export const handler = serverless(app);