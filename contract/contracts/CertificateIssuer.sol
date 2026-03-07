// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title CertificateIssuer
 * @dev Stores certificates. Only addresses in the verified institutions list can issue.
 *      The list is maintained by a designated listMaintainer (e.g., a backend account).
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

    // Bloom Filter
    uint256 private bloomFilter; // 256-bit filter
    uint8 private constant BLOOM_K = 3;
    uint256 private constant SALT0 = 0x8c7b;
    uint256 private constant SALT1 = 0x1f3d;
    uint256 private constant SALT2 = 0x4a9e;

    // Merkle Tree (batch roots)
    mapping(bytes32 => bytes32) public batchMerkleRoots;   // batchId => root hash
    mapping(bytes32 => address) public batchIssuer;       // batchId => issuer

    // ---------- Verified Institutions ----------
    address public immutable listMaintainer;  // address authorised to update the verified list
    mapping(address => bool) public verifiedInstitutions;

    // Events
    event CertificateIssued(string indexed certId, address indexed issuer, string ipfsCID, bytes32 pdfHash);
    event CertificateRevoked(string indexed certId);
    event BatchRootSet(bytes32 indexed batchId, address indexed issuer, bytes32 merkleRoot);
    event InstitutionAdded(address indexed institution);
    event InstitutionRemoved(address indexed institution);

    modifier onlyMaintainer() {
        require(msg.sender == listMaintainer, "Not list maintainer");
        _;
    }

    modifier onlyVerified() {
        require(verifiedInstitutions[msg.sender], "Not a verified institution");
        _;
    }

    constructor(address _listMaintainer) {
        require(_listMaintainer != address(0), "Invalid maintainer");
        listMaintainer = _listMaintainer;
    }

    // ---------- List Management (only maintainer) ----------
    function addInstitution(address _institution) external onlyMaintainer {
        require(_institution != address(0), "Invalid address");
        require(!verifiedInstitutions[_institution], "Already verified");
        verifiedInstitutions[_institution] = true;
        emit InstitutionAdded(_institution);
    }

    function removeInstitution(address _institution) external onlyMaintainer {
        require(verifiedInstitutions[_institution], "Not verified");
        verifiedInstitutions[_institution] = false;
        emit InstitutionRemoved(_institution);
    }

    // ---------- Bloom Filter Functions ----------
    function _addToBloomFilter(string memory _certId) private {
        uint256 index0 = uint256(keccak256(abi.encodePacked(SALT0, _certId))) % 256;
        uint256 index1 = uint256(keccak256(abi.encodePacked(SALT1, _certId))) % 256;
        uint256 index2 = uint256(keccak256(abi.encodePacked(SALT2, _certId))) % 256;
        bloomFilter = bloomFilter | (1 << index0) | (1 << index1) | (1 << index2);
    }

    function possiblyExists(string calldata _certId) external view returns (bool) {
        uint256 index0 = uint256(keccak256(abi.encodePacked(SALT0, _certId))) % 256;
        uint256 index1 = uint256(keccak256(abi.encodePacked(SALT1, _certId))) % 256;
        uint256 index2 = uint256(keccak256(abi.encodePacked(SALT2, _certId))) % 256;
        return (bloomFilter & (1 << index0)) != 0 &&
               (bloomFilter & (1 << index1)) != 0 &&
               (bloomFilter & (1 << index2)) != 0;
    }

    // ---------- Core Certificate Functions ----------
    /**
     * @dev Issues a new certificate. The caller must be a verified institution.
     * @param _certId Unique identifier for the certificate.
     * @param _ipfsCID IPFS CID of the encrypted PDF.
     * @param _pdfHash SHA-256 hash of the raw (unencrypted) PDF.
     * @param _signature Institution's RSA signature of the hash.
     */
    function issueCertificate(
        string calldata _certId,
        string calldata _ipfsCID,
        bytes32 _pdfHash,
        bytes calldata _signature
    ) external onlyVerified {
        require(bytes(certificates[_certId].ipfsCID).length == 0, "ID exists");

        certificates[_certId] = Certificate({
            ipfsCID: _ipfsCID,
            pdfHash: _pdfHash,
            signature: _signature,
            issuer: msg.sender,
            revoked: false
        });
        certificateIds.push(_certId);

        _addToBloomFilter(_certId);

        emit CertificateIssued(_certId, msg.sender, _ipfsCID, _pdfHash);
    }

    /**
     * @dev Revokes a certificate. Only the original issuer can revoke.
     */
    function revokeCertificate(string calldata _certId) external {
        Certificate storage cert = certificates[_certId];
        require(cert.issuer == msg.sender, "Not issuer");
        require(!cert.revoked, "Revoked");

        cert.revoked = true;
        emit CertificateRevoked(_certId);
    }

    /**
     * @dev Returns all details of a certificate.
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

    // ---------- Batch Merkle Root Functions ----------
    function setBatchRoot(bytes32 _batchId, bytes32 _merkleRoot) external {
        require(batchMerkleRoots[_batchId] == bytes32(0), "Root set");
        batchMerkleRoots[_batchId] = _merkleRoot;
        batchIssuer[_batchId] = msg.sender;
        emit BatchRootSet(_batchId, msg.sender, _merkleRoot);
    }

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

    function computeCertificateLeaf(
        string calldata _certId,
        string calldata _ipfsCID,
        bytes32 _pdfHash,
        address _issuer
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_certId, _ipfsCID, _pdfHash, _issuer));
    }
} 