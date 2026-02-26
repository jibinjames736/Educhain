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
  console.log('Firebase Admin initialized');
} catch (err) {
  console.warn('Firebase Admin not configured – universityId mapping will be unavailable');
}

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

//  Helper: Verify a single certificate buffer 
async function verifyCertificateBuffer(fileBuffer, fileName, certId, universityId) {
  try {
    // 1. Compute SHA‑256 hash of the file
    const fileHash = cryptoLib.computeHash(fileBuffer);
    const fileHashHex = '0x' + fileHash.toString('hex');

    // 2. Connect to blockchain (ethers v5)
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);

    // 3. Quick existence check using Bloom filter
    const mightExist = await contract.possiblyExists(certId);
    if (!mightExist) {
      throw new Error('Certificate ID not found (Bloom filter negative)');
    }

    // 4. Fetch full certificate data
    let certData;
    try {
      certData = await contract.getCertificate(certId);
    } catch (err) {
      throw new Error('Certificate ID not found on blockchain (false positive in Bloom filter)');
    }
    const [ipfsCID, pdfHash, signature, issuer, revoked] = certData;

    // 5. Check if revoked
    if (revoked) {
      throw new Error('Certificate has been revoked');
    }

    // 6. Compare file hash with on‑chain pdfHash
    const hashMatch = (fileHashHex.toLowerCase() === pdfHash.toLowerCase());

    // 7. Get the university record by querying registrationId field
    if (!db) {
      throw new Error('University mapping database not available');
    }
    const snapshot = await db.collection('users')
      .where('registrationId', '==', universityId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      throw new Error(`University ID ${universityId} not found in database`);
    }
    const uniData = snapshot.docs[0].data();
    if (uniData.role !== 'UNIVERSITY') {
      throw new Error(`User ${universityId} is not a university`);
    }
    const expectedAddress = uniData.wallet; // field name is 'wallet' in your data
    if (!expectedAddress) {
      throw new Error(`No Ethereum address associated with university ${universityId}`);
    }

    // 8. Verify signature (ECDSA) – ethers v5 uses utils.verifyMessage
    let signatureValid = false;
    try {
      const recoveredAddress = ethers.utils.verifyMessage(fileHashHex, signature);
      signatureValid = (recoveredAddress.toLowerCase() === expectedAddress.toLowerCase());
    } catch (err) {
      signatureValid = false;
    }

    return {
      fileName,
      success: true,
      certId,
      fileHash: fileHashHex,
      onChain: { ipfsCID, pdfHash, issuer, revoked },
      verification: { hashMatch, signatureValid, existsOnChain: true },
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

//  Step 1: Prepare 
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

//  Step 2: Finalize 
app.post('/api/finalize', async (req, res) => {
  try {
    const { tempId, signature, issuer } = req.body;

    const temp = tempStore.get(tempId);
    if (!temp) {
      return res.status(404).json({ error: 'Temporary data expired or not found' });
    }
    tempStore.delete(tempId);

    const { pdfBuffer, formData } = temp;
    const pdfHash = cryptoLib.computeHash(pdfBuffer);

    const recovered = cryptoLib.recoverSigner(pdfHash, signature);
    if (recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ error: 'Signature does not match issuer' });
    }

    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);
    const cid = await ipfs.upload(encryptedData);
    const keyWithIv = Buffer.concat([key, iv]).toString('base64');
    const verificationUrl = `https://certverify.app/verify/${formData.certId}`;

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
    res.status(500).json({ error: error.message });
  }
});

//  Single File Verification 
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

//  Multiple File Verification
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

//  QR/ID Verification 
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
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));