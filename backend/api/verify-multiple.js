// api/verify-multiple.js
const { verifyCertificateBuffer } = require('../path-to-your-backend-file'); // adjust path

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Your verification logic here – you'll need to adapt it because req is different in serverless
    // For simplicity, you can copy the logic from your Express app.post('/api/verify-multiple', ...)
    // and adapt it to use req.body / req.files.

    // Since you're using express-fileupload, it's easier to keep the Express wrapper.
    // But let's first test if the function is called at all.
    return res.status(200).json({ message: 'Function reached' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}