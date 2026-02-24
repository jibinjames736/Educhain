require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const pdf = require('./pdf');
const cryptoLib = require('./crypto');
const ipfs = require('./ipfs');
const blockchain = require('./blockchain');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Temporary storage for PDFs waiting for signature
// Key: tempId, Value: { pdfBuffer, formData, createdAt }
const tempStore = new Map();

// Cleanup expired temp entries every minute
const TEMP_TIMEOUT = parseInt(process.env.TEMP_STORAGE_TIMEOUT) || 300000;
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of tempStore.entries()) {
    if (now - data.createdAt > TEMP_TIMEOUT) {
      tempStore.delete(id);
    }
  }
}, 60000);

// ---------- Step 1: Prepare (generate PDF, return hash) ----------
app.post('/api/prepare', async (req, res) => {
  try {
    const formData = req.body; // { studentName, course, certId, ... }

    // 1. Generate PDF from form data
    const pdfBuffer = await pdf.generatePDF(formData);

    // 2. Compute SHA-256 hash
    const hash = cryptoLib.computeHash(pdfBuffer);

    // 3. Store temporarily with a unique ID
    const tempId = crypto.randomBytes(16).toString('hex');
    tempStore.set(tempId, {
      pdfBuffer,
      formData,
      createdAt: Date.now()
    });

    // 4. Return hash (with 0x prefix for MetaMask) and tempId
    res.json({
      pdfHash: '0x' + hash.toString('hex'),
      tempId
    });
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Step 2: Finalize (encrypt, upload, store on blockchain) ----------
app.post('/api/finalize', async (req, res) => {
  try {
    const { tempId, signature, issuer } = req.body;

    // 1. Retrieve temporary PDF
    const temp = tempStore.get(tempId);
    if (!temp) {
      return res.status(404).json({ error: 'Temporary data expired or not found' });
    }
    tempStore.delete(tempId); // one-time use
    const { pdfBuffer, formData } = temp;

    // 2. Compute hash again (should match the one signed)
    const pdfHash = cryptoLib.computeHash(pdfBuffer); // raw Buffer

    // 3. Verify that the signature matches the issuer
    const recovered = cryptoLib.recoverSigner(pdfHash, signature);
    if (recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ error: 'Signature does not match issuer' });
    }

    // 4. Generate AES key and encrypt PDF
    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);

    // 5. Upload encrypted PDF to IPFS (Pinata)
    const cid = await ipfs.upload(encryptedData);

    // 6. Call smart contract
    const txHash = await blockchain.issueCertificate(
      formData.certId,      // unique certificate ID from form
      cid,
      '0x' + pdfHash.toString('hex'),
      signature,            // already 0x-prefixed from MetaMask
      issuer
    );

    // 7. Prepare verification URL (combine key and IV into one base64 string)
    const keyWithIv = Buffer.concat([key, iv]).toString('base64');
    const verificationUrl = `https://verify.example.com?cid=${cid}&key=${encodeURIComponent(keyWithIv)}`;

    // 8. Return data to frontend
    res.json({
      pdfData: encryptedData.toString('base64'),   // base64 of encrypted PDF
      aesKey: keyWithIv,                           // base64 of key+iv
      verificationUrl,
      txHash
    });
  } catch (error) {
    console.error('Finalize error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
