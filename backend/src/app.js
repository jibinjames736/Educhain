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

// Firebase Admin
let db = null;
try {
  const admin = require('firebase-admin');
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  db = admin.firestore();
  console.log('✅ Firebase Admin initialized');
} catch (err) {
  console.warn('⚠️ Firebase Admin not configured – universityId mapping will be unavailable');
}

// IPFS health check at startup
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

// ==================== HELPER: Compute Merkle leaf for batch certificate ====================
function computeLeaf(certId, ipfsCID, pdfHashHex, issuerAddress) {
  // pdfHashHex is expected to be a 0x-prefixed hex string
  const pdfHashBytes = ethers.utils.arrayify(pdfHashHex);
  // Encode tightly: certId (string), ipfsCID (string), pdfHash (bytes32), issuer (address)
  const encoded = ethers.utils.solidityPack(
    ['string', 'string', 'bytes32', 'address'],
    [certId, ipfsCID, pdfHashBytes, issuerAddress]
  );
  return ethers.utils.keccak256(encoded);
}

// ==================== VERIFICATION CORE (with detailed logging) ====================
async function verifyCertificateBuffer(fileBuffer, fileName, certId, universityId) {
  try {
    // 1. Compute SHA‑256 hash of the file
    const fileHash = cryptoLib.computeHash(fileBuffer);
    const fileHashHex = '0x' + fileHash.toString('hex');
    console.log(`[${fileName}] Computed file hash: ${fileHashHex}`);

    // 2. Connect to blockchain
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);

    // 3. Get university (issuer) address from Firestore
    if (!db) throw new Error('Database not available');
    console.log(`[${fileName}] Looking up university with registrationId: "${universityId}"`);
    const snapshot = await db.collection('users')
      .where('registrationId', '==', universityId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      console.error(`[${fileName}] No user found with registrationId = "${universityId}"`);
      throw new Error(`University ID ${universityId} not found in database`);
    }
    const uniData = snapshot.docs[0].data();
    console.log(`[${fileName}] Found user:`, { role: uniData.role, wallet: uniData.wallet });
    if (uniData.role !== 'UNIVERSITY') {
      console.error(`[${fileName}] User role is "${uniData.role}", expected "UNIVERSITY"`);
      throw new Error(`User ${universityId} is not a university`);
    }
    const expectedAddress = uniData.wallet;
    if (!expectedAddress) {
      console.error(`[${fileName}] User has no wallet address`);
      throw new Error(`No Ethereum address associated with university ${universityId}`);
    }
    console.log(`[${fileName}] Expected issuer address: "${expectedAddress}"`);

    // 4. Try to fetch individual certificate from blockchain
    let individualCertData = null;
    try {
      console.log(`[${fileName}] Checking on‑chain for individual certificate with certId: "${certId}"`);
      const certData = await contract.getCertificate(certId);
      // getCertificate returns [ipfsCID, pdfHash, signature, issuer, revoked]
      if (certData && certData[0] !== '') {
        individualCertData = certData;
        console.log(`[${fileName}] Individual certificate found on‑chain.`);
      } else {
        console.log(`[${fileName}] No individual certificate found on‑chain.`);
      }
    } catch (err) {
      console.log(`[${fileName}] No individual certificate on‑chain (contract threw).`);
    }

    if (individualCertData) {
      // ----- INDIVIDUAL VERIFICATION -----
      const [ipfsCID, pdfHash, signature, issuer, revoked] = individualCertData;
      console.log(`[${fileName}] Individual on‑chain data:`, { ipfsCID, pdfHash, issuer, revoked });

      if (revoked) {
        throw new Error('Certificate has been revoked');
      }

      const hashMatch = (fileHashHex.toLowerCase() === pdfHash.toLowerCase());
      console.log(`[${fileName}] Hash match: ${hashMatch} (file: ${fileHashHex}, on‑chain: ${pdfHash})`);

      let signatureValid = false;
      try {
        const recoveredAddress = ethers.utils.verifyMessage(fileHash, signature);
        signatureValid = (recoveredAddress.toLowerCase() === expectedAddress.toLowerCase());
        console.log(`[${fileName}] Signature valid: ${signatureValid}, recovered: ${recoveredAddress}`);
      } catch (err) {
        console.error(`[${fileName}] Signature verification error:`, err.message);
      }

      return {
        fileName,
        success: true,
        certId,
        fileHash: fileHashHex,
        method: 'individual',
        onChain: { ipfsCID, pdfHash, issuer, revoked },
        verification: { hashMatch, signatureValid, existsOnChain: true },
        university: {
          name: uniData.universityName || uniData.name,
          email: uniData.email,
          address: expectedAddress,
        },
      };
    }

    // ----- BATCH VERIFICATION (fallback) -----
    console.log(`[${fileName}] Falling back to batch verification.`);
    console.log(`[${fileName}] Querying Firestore: certificates collection where certId == "${certId}" AND issuer == "${expectedAddress}"`);

    const certSnapshot = await db.collection('certificates')
      .where('certId', '==', certId)
      .where('issuer', '==', expectedAddress)
      .limit(1)
      .get();

    console.log(`[${fileName}] Firestore query returned ${certSnapshot.size} documents.`);

    if (certSnapshot.empty) {
      // Log a sample document from the certificates collection to see what exists
      const sampleQuery = await db.collection('certificates').limit(1).get();
      if (!sampleQuery.empty) {
        const sample = sampleQuery.docs[0].data();
        console.log(`[${fileName}] Sample certificate in collection:`, {
          certId: sample.certId,
          issuer: sample.issuer,
          hasProof: !!sample.proof,
          hasBatchId: !!sample.batchId
        });
      } else {
        console.log(`[${fileName}] The certificates collection is completely empty.`);
      }
      throw new Error('Certificate not found on‑chain or in database');
    }

    const certData = certSnapshot.docs[0].data();
    console.log(`[${fileName}] Certificate document found:`, {
      certId: certData.certId,
      issuer: certData.issuer,
      batchId: certData.batchId,
      hasProof: Array.isArray(certData.proof),
      proofLength: certData.proof ? certData.proof.length : 0,
      ipfsCid: certData.ipfsCid,
      pdfHash: certData.pdfHash,
    });

    // Check if this is a batch‑issued certificate (has proof and batchId)
    if (!certData.proof || !certData.batchId) {
      console.error(`[${fileName}] Certificate missing proof or batchId.`);
      throw new Error('Certificate found in database but missing batch verification data');
    }

    const { ipfsCid, pdfHash: storedPdfHash, proof, batchId } = certData;

    // Compare file hash with stored pdfHash
    if (fileHashHex.toLowerCase() !== storedPdfHash.toLowerCase()) {
      console.error(`[${fileName}] File hash mismatch: computed ${fileHashHex}, stored ${storedPdfHash}`);
      throw new Error('File hash does not match stored PDF hash');
    }
    console.log(`[${fileName}] File hash matches stored PDF hash.`);

    // Compute leaf
    const leaf = computeLeaf(certId, ipfsCid, storedPdfHash, expectedAddress);
    console.log(`[${fileName}] Computed leaf: ${leaf}`);

    // --- FIX: Convert batchId (UUID) to bytes32 as done in frontend ---
    const batchIdClean = batchId.replace(/-/g, '');
    const batchIdPadded = batchIdClean.padEnd(64, '0');
    const batchIdBytes32 = '0x' + batchIdPadded;
    console.log(`[${fileName}] Converted batchId to bytes32: ${batchIdBytes32}`);

    // Verify Merkle proof on‑chain using the bytes32 batch ID
    console.log(`[${fileName}] Calling verifyCertificateInBatch with batchId: ${batchIdBytes32}, leaf: ${leaf}, proof:`, proof);
    const merkleProofValid = await contract.verifyCertificateInBatch(batchIdBytes32, leaf, proof);
    console.log(`[${fileName}] Merkle proof valid: ${merkleProofValid}`);

    if (!merkleProofValid) {
      throw new Error('Merkle proof invalid – certificate not part of the batch');
    }

    // Optionally fetch the batch root for context
    const root = await contract.batchMerkleRoots(batchIdBytes32);
    console.log(`[${fileName}] On‑chain root for batch ${batchIdBytes32}: ${root}`);

    return {
      fileName,
      success: true,
      certId,
      fileHash: fileHashHex,
      method: 'batch',
      onChain: { batchId: batchIdBytes32, root },
      verification: { hashMatch: true, merkleProofValid },
      university: {
        name: uniData.universityName || uniData.name,
        email: uniData.email,
        address: expectedAddress,
      },
    };

  } catch (error) {
    console.error(`[${fileName}] Verification error:`, error.message);
    return {
      fileName,
      success: false,
      error: error.message,
    };
  }
}

// ==================== EXISTING ENDPOINTS ====================

// Step 1: Prepare
app.post('/api/prepare', async (req, res) => {
  try {
    const formData = req.body;
    const pdfBase64 = formData.pdfBase64;
    if (!pdfBase64) {
      return res.status(400).json({ error: 'Missing pdfBase64 in request body' });
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const hash = cryptoLib.computeHash(pdfBuffer);
    const tempId = crypto.randomBytes(16).toString('hex');
    tempStore.set(tempId, { pdfBuffer, formData, createdAt: Date.now() });
    res.json({ pdfHash: '0x' + hash.toString('hex'), tempId });
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Step 2: Finalize (with detailed error messages)
app.post('/api/finalize', async (req, res) => {
  try {
    const { tempId, signature, issuer } = req.body;

    // Validate required fields
    if (!tempId || !signature || !issuer) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: { tempId: !!tempId, signature: !!signature, issuer: !!issuer }
      });
    }

    const temp = tempStore.get(tempId);
    if (!temp) {
      return res.status(404).json({ error: 'Temporary data expired or not found' });
    }
    tempStore.delete(tempId);

    const { pdfBuffer, formData } = temp;
    const pdfHash = cryptoLib.computeHash(pdfBuffer);

    // Verify signature
    let recovered;
    try {
      recovered = cryptoLib.recoverSigner(pdfHash, signature);
    } catch (err) {
      console.error('Signature recovery error:', err);
      return res.status(400).json({ error: 'Invalid signature format', detail: err.message });
    }

    if (!recovered || recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ 
        error: 'Signature does not match issuer',
        expected: issuer,
        recovered: recovered || 'none'
      });
    }

    // Encrypt and upload to IPFS
    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);
    let cid;
    try {
      cid = await ipfs.upload(encryptedData);
    } catch (ipfsErr) {
      console.error('IPFS upload failed:', ipfsErr);
      return res.status(500).json({ error: 'IPFS upload failed', detail: ipfsErr.message });
    }

    const keyWithIv = Buffer.concat([key, iv]).toString('base64');

    // ✅ CHANGE: Use environment variable for base URL, fallback to your Vercel app
    const baseUrl = process.env.VERIFICATION_BASE_URL || 'https://educhain-rust.vercel.app';
    const verificationUrl = `${baseUrl}/verify/${formData.certId}`;

    res.json({
      cid,
      pdfHashHex: '0x' + pdfHash.toString('hex'),
      signature,
      issuer,
      certId: formData.certId,
      encryptedPdfBase64: encryptedData.toString('base64'),
      aesKeyWithIv: keyWithIv,
      verificationUrl
    });
  } catch (error) {
    console.error('Finalize error:', error);
    res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
});

// Single File Verification
app.post('/api/verify', async (req, res) => {
  try {
    if (!req.files || !req.files.certificate) {
      return res.status(400).json({ error: 'No certificate file uploaded' });
    }
    const file = req.files.certificate;

    const { certId, universityId } = req.body;
    if (!certId || !universityId) {
      return res.status(400).json({ error: 'certId and universityId are required' });
    }

    const result = await verifyCertificateBuffer(file.data, file.name, certId, universityId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Multiple File Verification
app.post('/api/verify-multiple', async (req, res) => {
  try {
    if (!req.files || !req.files.certificates) {
      return res.status(400).json({ error: 'No certificate files uploaded' });
    }

    const files = Array.isArray(req.files.certificates)
      ? req.files.certificates
      : [req.files.certificates];

    const { certId, universityId } = req.body;
    if (!certId || !universityId) {
      return res.status(400).json({ error: 'certId and universityId are required for batch verification' });
    }

    const results = await Promise.all(
      files.map(file => verifyCertificateBuffer(file.data, file.name, certId, universityId))
    );

    res.json({ results });
  } catch (error) {
    console.error('Batch verification error:', error);
    res.status(500).json({ error: 'Batch verification failed' });
  }
});

// QR/ID Verification
app.post('/api/verify-qr', async (req, res) => {
  try {
    const { certId, universityId } = req.body;
    if (!certId || !universityId) {
      return res.status(400).json({ error: 'certId and universityId are required' });
    }

    if (!db) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const certDoc = await db.collection('certificates').doc(certId).get();
    if (!certDoc.exists) {
      return res.status(404).json({ error: 'Certificate not found in database' });
    }
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
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error('QR verification error:', error);
    res.status(500).json({ error: 'QR verification failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));