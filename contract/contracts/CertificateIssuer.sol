// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;



/**
  CertificateIssuer
  Stores certificate records with on-chain Bloom filter and Merkle root support.
 */
contract CertificateIssuer {
    struct Certificate {
        string ipfsCID;      // IPFS content identifier of the encrypted PDF
        bytes32 pdfHash;     // SHA-256 hash of the raw (unencrypted) PDF
        bytes signature;    // Institution's RSA signature of the hash
        address issuer;     // Ethereum address of the issuer (staff)
        bool revoked;       // Revocation status
    }

    // Main certificate storage
    mapping(string => Certificate) public certificates;
    string[] public certificateIds; // Optional: list of all certificate IDs

    //  Bloom Filter (probabilistic existence check) 
    uint256 private bloomFilter; // 256-bit filter
    uint8 private constant BLOOM_K = 3; // number of hash functions
    // Salts for each hash function - can be any distinct values
    uint256 private constant SALT0 = 0x8c7b;
    uint256 private constant SALT1 = 0x1f3d;
    uint256 private constant SALT2 = 0x4a9e;

    //Merkle Tree (batch roots) 
    mapping(bytes32 => bytes32) public batchMerkleRoots;   // batchId => root hash
    mapping(bytes32 => address) public batchIssuer;       // batchId => issuer

    // Events
    event CertificateIssued(string indexed certId, address indexed issuer, string ipfsCID, bytes32 pdfHash);
    event CertificateRevoked(string indexed certId);
    event BatchRootSet(bytes32 indexed batchId, address indexed issuer, bytes32 merkleRoot);

    // Bloom Filter Functions 
    function _addToBloomFilter(string memory _certId) private {
        uint256 index0 = uint256(keccak256(abi.encodePacked(SALT0, _certId))) % 256;
        uint256 index1 = uint256(keccak256(abi.encodePacked(SALT1, _certId))) % 256;
        uint256 index2 = uint256(keccak256(abi.encodePacked(SALT2, _certId))) % 256;
        bloomFilter = bloomFilter | (1 << index0) | (1 << index1) | (1 << index2);
    }

    /**
      Quickly checks if a certificate ID *might* have been issued.
           False positives are possible, false negatives are impossible.
     */
    function possiblyExists(string calldata _certId) external view returns (bool) {
        uint256 index0 = uint256(keccak256(abi.encodePacked(SALT0, _certId))) % 256;
        uint256 index1 = uint256(keccak256(abi.encodePacked(SALT1, _certId))) % 256;
        uint256 index2 = uint256(keccak256(abi.encodePacked(SALT2, _certId))) % 256;
        return (bloomFilter & (1 << index0)) != 0 &&
               (bloomFilter & (1 << index1)) != 0 &&
               (bloomFilter & (1 << index2)) != 0;
    }

    // Core Certificate Functions 
    /**
     *  Issues a new certificate. Only called by the backend (or staff) after PDF generation.
     */
    function issueCertificate(
        string calldata _certId,
        string calldata _ipfsCID,
        bytes32 _pdfHash,
        bytes calldata _signature,
        address _issuer
    ) external {
        require(bytes(certificates[_certId].ipfsCID).length == 0, "ID exists");

        certificates[_certId] = Certificate({
            ipfsCID: _ipfsCID,
            pdfHash: _pdfHash,
            signature: _signature,
            issuer: _issuer,
            revoked: false
        });
        certificateIds.push(_certId);

        // Add the certificate ID to the Bloom filter
        _addToBloomFilter(_certId);

        emit CertificateIssued(_certId, _issuer, _ipfsCID, _pdfHash);
    }

    /**
     * Revokes a certificate. Only the original issuer can revoke.
     */
    function revokeCertificate(string calldata _certId) external {
        Certificate storage cert = certificates[_certId];
        require(cert.issuer == msg.sender, "Not issuer");
        require(!cert.revoked, "Revoked");

        cert.revoked = true;
        emit CertificateRevoked(_certId);
    }

    /**
     *  Returns all details of a certificate.
     */
    function getCertificate(string calldata _certId) external view returns (
        string memory ipfsCID,
        bytes32 pdfHash,
        bytes memory signature,
        address issuer,
        bool revoked
    ) {
        Certificate storage cert = certificates[_certId];
        return (cert.ipfsCID, cert.pdfHash, cert.signature, cert.issuer, cert.revoked);
    }

    
    /**
      Sets the Merkle root for a batch of certificates (e.g., all certificates issued in a day).
           The batch issuer (msg.sender) is recorded.
     */
    function setBatchRoot(bytes32 _batchId, bytes32 _merkleRoot) external {
        require(batchMerkleRoots[_batchId] == bytes32(0), "Root set");
        batchMerkleRoots[_batchId] = _merkleRoot;
        batchIssuer[_batchId] = msg.sender;
        emit BatchRootSet(_batchId, msg.sender, _merkleRoot);
    }

    /**
      Verifies that a given leaf (hash of a certificate) is part of a batch.
     _batchId The identifier of the batch.
     _leaf The leaf hash (computed off-chain as keccak256(abi.encodePacked(certId, ipfsCID, pdfHash, issuer)))
     _proof The Merkle proof (array of sibling hashes) leading to the root.
      @return True if the proof is valid.
     */
    function verifyCertificateInBatch(
        bytes32 _batchId,
        bytes32 _leaf,
        bytes32[] calldata _proof
    ) external view returns (bool) {
        bytes32 root = batchMerkleRoots[_batchId];
        require(root != bytes32(0), "No root");

        bytes32 computed = _leaf;
        for (uint256 i = 0; i < _proof.length; i++) {
            bytes32 sibling = _proof[i];
            if (computed < sibling) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
        }
        return computed == root;
    }

    /**
     Helper to compute the leaf hash for a certificate 
     */
    function computeCertificateLeaf(
        string calldata _certId,
        string calldata _ipfsCID,
        bytes32 _pdfHash,
        address _issuer
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_certId, _ipfsCID, _pdfHash, _issuer));
    }
}