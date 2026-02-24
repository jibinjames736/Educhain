const { create } = require('ipfs-http-client');

const ipfs = create({ url: process.env.IPFS_URL || 'http://localhost:5001' });

async function upload(fileBuffer) {
  const { cid } = await ipfs.add(fileBuffer);
  return cid.toString();
}

module.exports = { upload };