const { ethers } = require('ethers');
const contractABI = require('../contracts/CertificateIssuer.json');

const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

async function issueCertificate(certId, ipfsCID, pdfHashHex, signatureHex, issuerAddress) {
  try {
    const tx = await contract.issueCertificate(
      certId,
      ipfsCID,
      pdfHashHex,      // bytes32 as hex string with 0x
      signatureHex,     // bytes as hex string with 0x
      issuerAddress,
      { gasLimit: 300000 } // adjust as needed
    );
    const receipt = await tx.wait();
    console.log(`Certificate issued, tx hash: ${receipt.transactionHash}`);
    return receipt.transactionHash;
  } catch (error) {
    console.error('Blockchain error:', error);
    throw new Error(`Blockchain transaction failed: ${error.message}`);
  }
}

// Optional: other functions like revoke, getCertificate for internal use
async function getCertificate(certId) {
  return await contract.getCertificate(certId);
}

module.exports = { issueCertificate, getCertificate };
