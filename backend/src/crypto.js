const crypto = require('crypto');
const { ethers } = require('ethers'); // ethers v5

/**
 * Computes SHA-256 hash of a buffer.
 * @param {Buffer} buffer - Input data
 * @returns {Buffer} 32‑byte raw hash
 */
function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

/**
 * Encrypts a PDF buffer with AES-256-CBC.
 * @param {Buffer} pdfBuffer - Plain PDF data
 * @returns {Object} { key, iv, encryptedData }
 */
function encryptPDF(pdfBuffer) {
  const key = crypto.randomBytes(32);      // AES-256 key
  const iv = crypto.randomBytes(16);       // Initialization vector
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(pdfBuffer), cipher.final()]);
  return { key, iv, encryptedData: encrypted };
}

/**
 * Recovers the signer's Ethereum address from a raw hash and signature.
 * @param {Buffer} pdfHashRaw - The raw 32‑byte hash that was signed
 * @param {string} signatureHex - Hex signature 
 * @returns {string} Ethereum address 
 */
function recoverSigner(pdfHashRaw, signatureHex) {
  
  return ethers.utils.verifyMessage(pdfHashRaw, signatureHex);
}

module.exports = { computeHash, encryptPDF, recoverSigner };