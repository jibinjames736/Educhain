const crypto = require('crypto');
const { ethers } = require('ethers');

// Compute SHA-256 hash of a buffer, returns raw Buffer (32 bytes)
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// Encrypt PDF with AES-256-CBC using a random key and IV
// Returns { key (32 bytes), iv (16 bytes), encryptedData (Buffer) }
function encryptPDF(pdfBuffer) {
  const key = crypto.randomBytes(32); // AES-256 key
  const iv = crypto.randomBytes(16);  // Initialization vector
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(pdfBuffer), cipher.final()]);
  return { key, iv, encryptedData: encrypted };
}

// Recover signer address from hash (raw Buffer) and signature (0x-prefixed hex)
function recoverSigner(pdfHashRaw, signatureHex) {
  // Convert raw hash to hex string with 0x prefix
  const messageHashHex = '0x' + pdfHashRaw.toString('hex');
  // ethers v5 uses ethers.utils.verifyMessage
  return ethers.utils.verifyMessage(messageHashHex, signatureHex);
}

module.exports = { computeHash, encryptPDF, recoverSigner };
