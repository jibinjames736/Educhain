import serverless from 'serverless-http';
import app from '../../backend/src/app.js';

// Use a named export – Vercel accepts both default and named exports
export const handler = serverless(app);