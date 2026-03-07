const { create } = require('ipfs-http-client');

// Use IPv4 explicitly to avoid WSL IPv6 issues
const IPFS_URL = process.env.IPFS_URL || 'http://127.0.0.1:5001';

// Create client with a longer timeout
const ipfs = create({ url: IPFS_URL, timeout: 30000 });

/**
 * Upload a buffer to IPFS with automatic retries.
 * @param {Buffer} fileBuffer - The file data
 * @param {Object} options - IPFS add options (default { pin: true })
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<string>} - The CID as a string
 */
async function upload(fileBuffer, options = { pin: true }, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const { cid } = await ipfs.add(fileBuffer, options);
      return cid.toString();
    } catch (err) {
      lastError = err;
      console.log(`IPFS upload attempt ${i + 1} failed: ${err.message}. Retrying in 2s...`);
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

module.exports = { upload };