require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const pdf = require('./pdf');
const cryptoLib = require('./crypto');
const ipfs = require('./ipfs');
// blockchain.js is no longer used here

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Temporary storage for PDFs waiting for signature
const tempStore = new Map();
const TEMP_TIMEOUT = parseInt(process.env.TEMP_STORAGE_TIMEOUT) || 300000;

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of tempStore.entries()) {
    if (now - data.createdAt > TEMP_TIMEOUT) tempStore.delete(id);
  }
}, 60000);

// ---------- Step 1: Prepare (generate PDF, return hash) ----------
app.post('/api/prepare', async (req, res) => {
  try {
    const formData = req.body; // { studentName, course, certId, ... }
    const pdfBuffer = await pdf.generatePDF(formData);
    const hash = cryptoLib.computeHash(pdfBuffer);
    const tempId = crypto.randomBytes(16).toString('hex');
    tempStore.set(tempId, { pdfBuffer, formData, createdAt: Date.now() });
    res.json({ pdfHash: '0x' + hash.toString('hex'), tempId });
  } catch (error) {
    console.error('Prepare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Step 2: Finalize (verify, encrypt, upload, return data) ----------
app.post('/api/finalize', async (req, res) => {
  try {
    const { tempId, signature, issuer } = req.body;

    const temp = tempStore.get(tempId);
    if (!temp) return res.status(404).json({ error: 'Temporary data expired or not found' });
    tempStore.delete(tempId);

    const { pdfBuffer, formData } = temp;
    const pdfHash = cryptoLib.computeHash(pdfBuffer);

    // Verify signature
    const recovered = cryptoLib.recoverSigner(pdfHash, signature);
    if (recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ error: 'Signature does not match issuer' });
    }

    // Encrypt PDF
    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);

    // Upload to IPFS
    const cid = await ipfs.upload(encryptedData);

    // Combine key and IV for easy transport
    const keyWithIv = Buffer.concat([key, iv]).toString('base64');

    // Build verification URL
    const verificationUrl = `https://verify.example.com?cid=${cid}&key=${encodeURIComponent(keyWithIv)}`;

    // Return everything the frontend needs to send the blockchain transaction
    res.json({
      cid,
      pdfHashHex: '0x' + pdfHash.toString('hex'),
      signature,           // already 0x-prefixed
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));