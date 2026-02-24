const { create } = require('ipfs-http-client');
const ipfs = create({ url: 'http://localhost:5001' });

async function test() {
  try {
    const data = Buffer.from('Hello IPFS');
    const { cid } = await ipfs.add(data);
    console.log('Upload successful, CID:', cid.toString());
  } catch (err) {
    console.error('Upload failed:', err);
  }
}
test();