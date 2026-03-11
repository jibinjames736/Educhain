import serverless from 'serverless-http';
import app from '../../backend/src/app.js';

let handler;

try {
  handler = serverless(app);
  console.log('✅ Handler created successfully');
} catch (error) {
  console.error('❌ Failed to create handler:', error);

  handler = async () => ({
    statusCode: 500,
    body: JSON.stringify({
      error: 'Handler creation failed',
      details: error.message
    })
  });
}

export default handler;