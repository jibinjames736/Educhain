require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const cryptoLib = require('./crypto');
const ipfs = require('./ipfs');

const app = express();
app.use(cors());

// Increase JSON payload limit to 50MB (adjust if needed)
app.use(bodyParser.json({ limit: '50mb' }));

// Temporary storage for PDFs waiting for signature
const tempStore = new Map();
const TEMP_TIMEOUT = parseInt(process.env.TEMP_STORAGE_TIMEOUT) || 300000;

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of tempStore.entries()) {
    if (now - data.createdAt > TEMP_TIMEOUT) tempStore.delete(id);
  }
}, 60000);

// ---------- Step 1: Prepare (accept PDF from frontend, return hash) ----------
app.post('/api/prepare', async (req, res) => {
  try {
    const formData = req.body; // { studentName, course, certId, studentId, universityName, pdfBase64 }
    const pdfBase64 = formData.pdfBase64;
    if (!pdfBase64) {
      return res.status(400).json({ error: 'Missing pdfBase64 in request body' });
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Compute hash of the PDF
    const hash = cryptoLib.computeHash(pdfBuffer);

    // Generate a temporary ID and store the PDF buffer along with form data
    const tempId = crypto.randomBytes(16).toString('hex');
    tempStore.set(tempId, { pdfBuffer, formData, createdAt: Date.now() });

    // Return the hash (as 0x-prefixed hex) and tempId
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
    if (!temp) {
      return res.status(404).json({ error: 'Temporary data expired or not found' });
    }
    tempStore.delete(tempId);

    const { pdfBuffer, formData } = temp;
    const pdfHash = cryptoLib.computeHash(pdfBuffer);

    // Verify signature matches the issuer
    const recovered = cryptoLib.recoverSigner(pdfHash, signature);
    if (recovered.toLowerCase() !== issuer.toLowerCase()) {
      return res.status(400).json({ error: 'Signature does not match issuer' });
    }

    // Encrypt the PDF (AES-256-CBC)
    const { key, iv, encryptedData } = cryptoLib.encryptPDF(pdfBuffer);

    // Upload encrypted PDF to IPFS
    const cid = await ipfs.upload(encryptedData);

    // Combine key and IV for easy transport (base64)
    const keyWithIv = Buffer.concat([key, iv]).toString('base64');

    // Build verification URL (customize as needed)
    const verificationUrl = `https://certverify.app/verify/${formData.certId}`;

    // Return all data needed by the frontend for blockchain transaction and Firestore
    res.json({
      cid,
      pdfHashHex: '0x' + pdfHash.toString('hex'),
      signature,           // already 0x-prefixed from frontend
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