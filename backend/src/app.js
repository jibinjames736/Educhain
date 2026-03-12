require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const { ethers } = require('ethers');   // ethers v5
console.log('Ethers version:', ethers.version);

const cryptoLib = require('./crypto');
const ipfs = require('./ipfs');
const contractABI = require('./contractABI.json');

// Firebase Admin – using environment variable
let db = null;
try {
  const admin = require('firebase-admin');
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin initialized from env var');
  } else {
    // Fallback to local file for development
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin initialized from local file');
  }
  db = admin.firestore();
} catch (err) {
  console.error('❌ Firebase Admin initialization error:', err.message);
  console.warn('⚠️ Firebase Admin not configured – universityId mapping will be unavailable');
}

// IPFS health check at startup (non‑blocking)
(async () => {
  try {
    const { create } = require('ipfs-http-client');
    const testClient = create({ url: process.env.IPFS_URL || 'http://127.0.0.1:5001', timeout: 5000 });
    const version = await testClient.version();
    console.log('✅ IPFS daemon connected, version:', version.version);
  } catch (err) {
    console.warn('⚠️ IPFS daemon not reachable. Uploads will fail:', err.message);
  }
})();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(fileUpload());

// Temporary storage for PDFs waiting for signature
const tempStore = new Map();
const TEMP_TIMEOUT = parseInt(process.env.TEMP_STORAGE_TIMEOUT) || 300000;

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of tempStore.entries()) {
    if (now - data.createdAt > TEMP_TIMEOUT) tempStore.delete(id);
  }
}, 60000);

//  HELPER: Compute Merkle leaf for batch certificate 
function computeLeaf(certId, ipfsCID, pdfHashHex, issuerAddress) {
  const pdfHashBytes = ethers.utils.arrayify(pdfHashHex);
  const encoded = ethers.utils.solidityPack(
    ['string', 'string', 'bytes32', 'address'],
    [certId, ipfsCID, pdfHashBytes, issuerAddress]
  );
  return ethers.utils.keccak256(encoded);
}

//  VERIFICATION CORE with timing logs 
async function verifyCertificateBuffer(fileBuffer, fileName, certId, universityId) {
  const startTime = Date.now();
  try {
    const fileHash = cryptoLib.computeHash(fileBuffer);
    const fileHashHex = '0x' + fileHash.toString('hex');
    console.log(`[${fileName}] Computed file hash: ${fileHashHex}`);

    console.time(`[${fileName}] Connect to blockchain`);
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);
    console.timeEnd(`[${fileName}] Connect to blockchain`);

    if (!db) throw new Error('Database not available');

    console.time(`[${fileName}] Firestore: find university`);
    console.log(`[${fileName}] Looking up university with registrationId: "${universityId}"`);
    const snapshot = await db.collection('users')
      .where('registrationId', '==', universityId)
      .limit(1)
      .get();
    console.timeEnd(`[${fileName}] Firestore: find university`);

    if (snapshot.empty) throw new Error(`University ID ${universityId} not found in database`);
    const uniData = snapshot.docs[0].data();
    if (uniData.role !== 'UNIVERSITY') throw new Error(`User ${universityId} is not a university`);
    const expectedAddress = uniData.wallet;
    if (!expectedAddress) throw new Error(`No Ethereum address associated with university ${universityId}`);

    // Try individual certificate
    let individualCertData = null;
    try {
      console.time(`[${fileName}] Blockchain: getCertificate`);
      const certData = await contract.getCertificate(certId);
      console.timeEnd(`[${fileName}] Blockchain: getCertificate`);
      if (certData && certData[0] !== '') individualCertData = certData;
    } catch (err) {
      console.log(`[${fileName}] getCertificate threw, falling back to batch`);
    }

    if (individualCertData) {
      const [ipfsCID, pdfHash, signature, issuer, revoked] = individualCertData;
      if (revoked) throw new Error('Certificate has been revoked');
      const hashMatch = (fileHashHex.toLowerCase() === pdfHash.toLowerCase());
      let signatureValid = false;
      try {
        const recoveredAddress = ethers.utils.verifyMessage(fileHash, signature);
        signatureValid = (recoveredAddress.toLowerCase() === expectedAddress.toLowerCase());
      } catch (err) {
        console.error(`[${fileName}] Signature verification error:`, err.message);
      }
      const duration = Date.now() - startTime;
      console.log(`[${fileName}] Verification completed in ${duration}ms`);
      return {
        fileName, success: true, certId, fileHash: fileHashHex, method: 'individual',
        onChain: { ipfsCID, pdfHash, issuer, revoked },
        verification: { hashMatch, signatureValid, existsOnChain: true },
        university: { name: uniData.universityName || uniData.name, email: uniData.email, address: expectedAddress }
      };
    }

    // Batch verification
    console.log(`[${fileName}] Falling back to batch verification.`);
    console.time(`[${fileName}] Firestore: find batch certificate`);
    const certSnapshot = await db.collection('certificates')
      .where('certId', '==', certId)
      .where('issuer', '==', expectedAddress)
      .limit(1)
      .get();
    console.timeEnd(`[${fileName}] Firestore: find batch certificate`);

    if (certSnapshot.empty) throw new Error('Certificate not found on‑chain or in database');
    const certData = certSnapshot.docs[0].data();
    if (!certData.proof || !certData.batchId) throw new Error('Certificate found but missing batch verification data');
    const { ipfsCid, pdfHash: storedPdfHash, proof, batchId } = certData;
    if (fileHashHex.toLowerCase() !== storedPdfHash.toLowerCase()) throw new Error('File hash does not match stored PDF hash');

    const leaf = computeLeaf(certId, ipfsCid, storedPdfHash, expectedAddress);
    const batchIdClean = batchId.replace(/-/g, '').padEnd(64, '0');
    const batchIdBytes32 = '0x' + batchIdClean;

    console.time(`[${fileName}] Blockchain: verifyCertificateInBatch`);
    const merkleProofValid = await contract.verifyCertificateInBatch(batchIdBytes32, leaf, proof);
    console.timeEnd(`[${fileName}] Blockchain: verifyCertificateInBatch`);

    if (!merkleProofValid) throw new Error('Merkle proof invalid – certificate not part of the batch');

    console.time(`[${fileName}] Blockchain: batchMerkleRoots`);
    const root = await contract.batchMerkleRoots(batchIdBytes32);
    console.timeEnd(`[${fileName}] Blockchain: batchMerkleRoots`);

    const duration = Date.now() - startTime;
    console.log(`[${fileName}] Verification completed in ${duration}ms`);
    return {
      fileName, success: true, certId, fileHash: fileHashHex, method: 'batch',
      onChain: { batchId: batchIdBytes32, root },
      verification: { hashMatch: true, merkleProofValid },
      university: { name: uniData.universityName || uniData.name, email: uniData.email, address: expectedAddress }
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${fileName}] Verification error after ${duration}ms:`, error.message);
    return { fileName, success: false, error: error.message };
  }
}

//  ROUTES 

app.post('/api/prepare', async (req, res) => {
  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'Missing pdfBase64' });
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const hash = cryptoLib.computeHash(pdfBuffer);
    const tempId = crypto.randomBytes(16).toString('hex');
    tempStore.set(tempId, { pdfBuffer, formData: req.body, createdAt: Date.now() });
    res.json({ pdfHash: '0x' + hash.toString('hex'), tempId });
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/finalize', async (req, res) => {
  try {
    const { tempId, signature, issuer } = req.body;
    if (!tempId || !signature || !issuer) return res.status(400).json({ error: 'Missing required fields' });
    const temp = tempStore.get(tempId);
    if (!temp) return res.status(404).json({ error: 'Temporary data expired' });
    tempStore.delete(tempId);

    const { pdfBuffer, formData } = temp;
    const pdfHash = cryptoLib.computeHash(pdfBuffer);
    const recovered = cryptoLib.recoverSigner(pdfHash, signature);
    if (!recovered || recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ error: 'Signature does not match issuer' });
    }

    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);
    const cid = await ipfs.upload(encryptedData);
    const keyWithIv = Buffer.concat([key, iv]).toString('base64');
    const baseUrl = process.env.VERIFICATION_BASE_URL || 'https://educhain-rust.vercel.app';
    const verificationUrl = `${baseUrl}/verify/${formData.certId}`;

    res.json({
      cid, pdfHashHex: '0x' + pdfHash.toString('hex'), signature, issuer,
      certId: formData.certId, encryptedPdfBase64: encryptedData.toString('base64'),
      aesKeyWithIv: keyWithIv, verificationUrl
    });
  } catch (error) {
    console.error('Finalize error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

app.post('/api/verify', async (req, res) => {
  try {
    if (!req.files || !req.files.certificate) return res.status(400).json({ error: 'No certificate file uploaded' });
    const file = req.files.certificate;
    const { certId, universityId } = req.body;
    if (!certId || !universityId) return res.status(400).json({ error: 'certId and universityId are required' });
    const result = await verifyCertificateBuffer(file.data, file.name, certId, universityId);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/verify-multiple', async (req, res) => {
  try {
    if (!req.files || !req.files.certificates) return res.status(400).json({ error: 'No certificate files uploaded' });
    const files = Array.isArray(req.files.certificates) ? req.files.certificates : [req.files.certificates];
    const { certId, universityId } = req.body;
    if (!certId || !universityId) return res.status(400).json({ error: 'certId and universityId are required' });
    const results = await Promise.all(
      files.map(file => verifyCertificateBuffer(file.data, file.name, certId, universityId))
    );
    res.json({ results });
  } catch (error) {
    console.error('Batch verification error:', error);
    res.status(500).json({ error: 'Batch verification failed' });
  }
});

app.post('/api/verify-qr', async (req, res) => {
  try {
    const { certId, universityId } = req.body;
    if (!certId || !universityId) return res.status(400).json({ error: 'Missing fields' });
    if (!db) return res.status(500).json({ error: 'Database not configured' });

    const certDoc = await db.collection('certificates').doc(certId).get();
    if (!certDoc.exists) return res.status(404).json({ error: 'Certificate not found' });
    const certData = certDoc.data();

    const ipfsUrl = `https://ipfs.io/ipfs/${certData.ipfsCid}`;
    const ipfsResponse = await fetch(ipfsUrl);
    if (!ipfsResponse.ok) throw new Error('Failed to fetch from IPFS');
    const encryptedPdfBuffer = await ipfsResponse.arrayBuffer();

    const aesKeyWithIv = Buffer.from(certData.aesKey, 'base64');
    const key = aesKeyWithIv.slice(0, 32);
    const iv = aesKeyWithIv.slice(32, 48);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decryptedPdfBuffer = Buffer.concat([
      decipher.update(Buffer.from(encryptedPdfBuffer)),
      decipher.final()
    ]);

    const result = await verifyCertificateBuffer(decryptedPdfBuffer, 'cert.pdf', certId, universityId);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('QR verification error:', error);
    res.status(500).json({ error: 'QR verification failed' });
  }
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'GET test works' });
});

//  VERCEL EXPORT 
module.exports = app;

// Local development server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
}