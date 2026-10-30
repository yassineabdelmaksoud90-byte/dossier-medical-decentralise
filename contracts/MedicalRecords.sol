// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Dossier médical décentralisé
/// @notice Les fichiers sont chiffrés hors-chaîne ; seul leur hash est stocké ici.
contract MedicalRecords {
    // ---------- Types ----------
    enum RecordType { Consultation, Analysis }
    enum Role { None, Doctor, Lab }

    struct Record {
        uint256 id;
        address patient;
        address author;        // médecin ou laboratoire
        RecordType recordType;
        string title;
        bytes32 fileHash;      // hash (keccak256) du fichier CHIFFRÉ
        string fileUri;        // ex: ipfs://CID ou URL du serveur
        uint256 timestamp;
    }

    // ---------- État ----------
    address public admin;
    mapping(address => Role) public roles;

    // patient => provider => date d'expiration (0 = pas d'accès)
    mapping(address => mapping(address => uint256)) private accessExpiry;
    uint256 private constant NO_EXPIRY = type(uint256).max;

    mapping(address => Record[]) private recordsOf;

    // ---------- Événements ----------
    event ProviderRegistered(address indexed provider, Role role);
    event AccessGranted(address indexed patient, address indexed provider, uint256 expiresAt);
    event AccessRevoked(address indexed patient, address indexed provider);
    event RecordAdded(
        address indexed patient,
        address indexed author,
        uint256 indexed id,
        RecordType recordType,
        bytes32 fileHash
    );

    // ---------- Modificateurs ----------
    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin uniquement");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------- Administration ----------
    /// @notice L'admin (ex: l'hôpital) enregistre un médecin ou un laboratoire.
    function registerProvider(address provider, Role role) external onlyAdmin {
        require(role != Role.None, "Role invalide");
        roles[provider] = role;
        emit ProviderRegistered(provider, role);
    }

    // ---------- Contrôle d'accès (le patient décide) ----------
    /// @param duration durée en secondes ; 0 = accès sans limite de temps
    function grantAccess(address provider, uint256 duration) external {
        require(roles[provider] != Role.None, "Prestataire non enregistre");
        uint256 expiresAt = duration == 0 ? NO_EXPIRY : block.timestamp + duration;
        accessExpiry[msg.sender][provider] = expiresAt;
        emit AccessGranted(msg.sender, provider, expiresAt);
    }

    function revokeAccess(address provider) external {
        require(accessExpiry[msg.sender][provider] != 0, "Aucun acces a retirer");
        accessExpiry[msg.sender][provider] = 0;
        emit AccessRevoked(msg.sender, provider);
    }

    function hasAccess(address patient, address provider) public view returns (bool) {
        return accessExpiry[patient][provider] > block.timestamp;
    }

    // ---------- Enregistrements ----------
    /// @notice Un prestataire autorisé ajoute une consultation / analyse au dossier du patient.
    function addRecord(
        address patient,
        RecordType recordType,
        string calldata title,
        bytes32 fileHash,
        string calldata fileUri
    ) external returns (uint256 id) {
        require(roles[msg.sender] != Role.None, "Non enregistre");
        require(hasAccess(patient, msg.sender), "Acces non autorise par le patient");
        if (recordType == RecordType.Analysis) {
            require(roles[msg.sender] == Role.Lab || roles[msg.sender] == Role.Doctor, "Role invalide");
        }

        id = recordsOf[patient].length;
        recordsOf[patient].push(
            Record(id, patient, msg.sender, recordType, title, fileHash, fileUri, block.timestamp)
        );
        emit RecordAdded(patient, msg.sender, id, recordType, fileHash);
    }

    /// @notice Lecture : patient lui-même ou prestataire autorisé.
    function getRecords(address patient) external view returns (Record[] memory) {
        require(
            msg.sender == patient || hasAccess(patient, msg.sender),
            "Lecture non autorisee"
        );
        return recordsOf[patient];
    }

    function getRecordCount(address patient) external view returns (uint256) {
        require(
            msg.sender == patient || hasAccess(patient, msg.sender),
            "Lecture non autorisee"
        );
        return recordsOf[patient].length;
    }

    /// @notice Vérifie l'intégrité : le hash du fichier fourni correspond-il à celui enregistré ?
    function verifyRecord(address patient, uint256 id, bytes32 hashToCheck) external view returns (bool) {
        require(
            msg.sender == patient || hasAccess(patient, msg.sender),
            "Lecture non autorisee"
        );
        require(id < recordsOf[patient].length, "Id inconnu");
        return recordsOf[patient][id].fileHash == hashToCheck;
    }
}
