require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const { ethers } = require('ethers');

console.log("Ethers version:", ethers.version);

const cryptoLib = require('./crypto');
const ipfs = require('./ipfs');
const contractABI = require('./contractABI.json');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(fileUpload());

/* =====================================================
   ENVIRONMENT DETECTION
===================================================== */

const isVercel = !!process.env.VERCEL;

/* =====================================================
   BLOCKCHAIN CONNECTION (GLOBAL FOR PERFORMANCE)
===================================================== */

const provider = new ethers.providers.JsonRpcProvider({
  url: process.env.ETHEREUM_RPC_URL,
  timeout: 20000
});

const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  contractABI,
  provider
);

/* =====================================================
   FIREBASE ADMIN
===================================================== */

let db = null;

try {
  const admin = require('firebase-admin');

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {

    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("✅ Firebase initialized from ENV");

  } else {

    const serviceAccount =
      require('./serviceAccountKey.json');

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("✅ Firebase initialized from local file");

  }

  db = admin.firestore();

} catch (err) {

  console.error("Firebase init error:", err.message);

}

/* =====================================================
   OPTIONAL LOCAL IPFS HEALTH CHECK
   (Only for local dev, skipped on Vercel)
===================================================== */

if (!isVercel) {

  (async () => {

    try {

      const { create } = require('ipfs-http-client');

      const client = create({
        url: process.env.IPFS_URL || 'http://127.0.0.1:5001'
      });

      const version = await client.version();

      console.log("✅ IPFS connected:", version.version);

    } catch (err) {

      console.warn("⚠️ IPFS daemon not reachable");

    }

  })();

}

/* =====================================================
   TEMP STORAGE
===================================================== */

const tempStore = new Map();
const TEMP_TIMEOUT = 300000;

setInterval(() => {

  const now = Date.now();

  for (const [id, data] of tempStore.entries()) {

    if (now - data.createdAt > TEMP_TIMEOUT) {
      tempStore.delete(id);
    }

  }

}, 60000);

/* =====================================================
   MERKLE LEAF
===================================================== */

function computeLeaf(certId, ipfsCID, pdfHashHex, issuerAddress) {

  const pdfHashBytes = ethers.utils.arrayify(pdfHashHex);

  const encoded = ethers.utils.solidityPack(
    ['string', 'string', 'bytes32', 'address'],
    [certId, ipfsCID, pdfHashBytes, issuerAddress]
  );

  return ethers.utils.keccak256(encoded);
}

/* =====================================================
   VERIFICATION CORE
===================================================== */

async function verifyCertificateBuffer(fileBuffer, fileName, certId, universityId) {

  try {

    const fileHash = cryptoLib.computeHash(fileBuffer);
    const fileHashHex = '0x' + fileHash.toString('hex');

    if (!db) throw new Error("Database unavailable");

    /* ---------- UNIVERSITY LOOKUP ---------- */

    let uniData = null;

    const snapshot = await db
      .collection('users')
      .where('registrationId', '==', universityId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error("University not found");
    }

    uniData = snapshot.docs[0].data();

    const expectedAddress = uniData.wallet;

    /* ---------- BLOCKCHAIN LOOKUP ---------- */

    let individualCertData = null;

    try {

      const certData = await contract.getCertificate(certId);

      if (certData && certData[0] !== '') {
        individualCertData = certData;
      }

    } catch (err) {
      console.log("Falling back to batch verification");
    }

    /* =================================================
       INDIVIDUAL CERTIFICATE
    ================================================= */

    if (individualCertData) {

      const [ipfsCID, pdfHash, signature, issuer, revoked] =
        individualCertData;

      const hashMatch =
        fileHashHex.toLowerCase() === pdfHash.toLowerCase();

      let signatureValid = false;

      try {

        const recovered =
          ethers.utils.verifyMessage(fileHash, signature);

        signatureValid =
          recovered.toLowerCase() === expectedAddress.toLowerCase();

      } catch (err) {}

      return {

        fileName,
        success: true,
        certId,
        method: "individual",

        verification: {
          hashMatch,
          signatureValid
        },

        onChain: {
          ipfsCID,
          issuer,
          revoked
        },

        university: {
          name: uniData.universityName || uniData.name,
          email: uniData.email,
          address: expectedAddress
        }
      };

    }

    /* =================================================
       BATCH CERTIFICATE
    ================================================= */

    const certSnapshot = await db
      .collection('certificates')
      .where('certId', '==', certId)
      .limit(1)
      .get();

    if (certSnapshot.empty) {
      throw new Error("Certificate not found");
    }

    const certData = certSnapshot.docs[0].data();

    const {
      ipfsCid,
      pdfHash: storedPdfHash,
      proof,
      batchId
    } = certData;

    if (fileHashHex.toLowerCase() !== storedPdfHash.toLowerCase()) {
      throw new Error("File hash mismatch");
    }

    const leaf = computeLeaf(
      certId,
      ipfsCid,
      storedPdfHash,
      expectedAddress
    );

    const batchIdClean =
      batchId.replace(/-/g, '').padEnd(64, '0');

    const batchIdBytes32 =
      '0x' + batchIdClean;

    const merkleProofValid =
      await contract.verifyCertificateInBatch(
        batchIdBytes32,
        leaf,
        proof
      );

    if (!merkleProofValid) {
      throw new Error("Merkle proof invalid");
    }

    return {

      fileName,
      success: true,
      certId,
      method: "batch",

      verification: {
        hashMatch: true,
        merkleProofValid
      },

      university: {
        name: uniData.universityName || uniData.name,
        email: uniData.email,
        address: expectedAddress
      }

    };

  } catch (error) {

    return {
      fileName,
      success: false,
      error: error.message
    };

  }
}

/* =====================================================
   VERIFY ROUTE
===================================================== */

app.post('/api/verify-multiple', async (req, res) => {

  try {

    if (!req.files || !req.files.certificates) {
      return res.status(400).json({
        error: "No certificate uploaded"
      });
    }

    const files = Array.isArray(req.files.certificates)
      ? req.files.certificates
      : [req.files.certificates];

    const { certId, universityId } = req.body;

    const results = await Promise.all(

      files.map(file =>
        verifyCertificateBuffer(
          file.data,
          file.name,
          certId,
          universityId
        )
      )

    );

    res.json({ results });

  } catch (error) {

    console.error("Verification error:", error);

    res.status(500).json({
      error: "Verification failed"
    });

  }
});

/* =====================================================
   TEST ROUTE
===================================================== */

app.get('/api/test', (req, res) => {
  res.json({ message: "API working" });
});

/* =====================================================
   EXPORT FOR VERCEL
===================================================== */

module.exports = app;

/* =====================================================
   LOCAL SERVER
===================================================== */

if (!isVercel) {

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`✅ Local backend running on port ${PORT}`);
  });

}