const axios = require('axios');
const FormData = require('form-data');

async function upload(fileBuffer, fileName = 'certificate.pdf') {
  const formData = new FormData();
  formData.append('file', fileBuffer, fileName);

  // Optional metadata
  const metadata = JSON.stringify({ name: fileName });
  formData.append('pinataMetadata', metadata);

  try {
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        maxBodyLength: 'Infinity',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
          // Use API Key + Secret as Basic Auth
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_API_SECRET,
        },
      }
    );
    return response.data.IpfsHash;
  } catch (error) {
    console.error('Pinata upload error:', error.response?.data || error.message);
    throw new Error(`IPFS upload failed: ${error.message}`);
  }
}

module.exports = { upload };
