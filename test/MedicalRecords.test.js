const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MedicalRecords", function () {
  let c, admin, patient, doctor, lab, stranger;
  const Doctor = 1, Lab = 2;
  const Consultation = 0, Analysis = 1;
  const hash = ethers.keccak256(ethers.toUtf8Bytes("fichier-chiffre"));

  beforeEach(async () => {
    [admin, patient, doctor, lab, stranger] = await ethers.getSigners();
    c = await (await ethers.getContractFactory("MedicalRecords")).deploy();
    await c.registerProvider(doctor.address, Doctor);
    await c.registerProvider(lab.address, Lab);
  });

  it("seul l'admin enregistre un prestataire", async () => {
    await expect(c.connect(stranger).registerProvider(stranger.address, Doctor))
      .to.be.revertedWith("Admin uniquement");
  });

  it("refuse l'ajout sans autorisation du patient", async () => {
    await expect(
      c.connect(doctor).addRecord(patient.address, Consultation, "Consultation", hash, "ipfs://x")
    ).to.be.revertedWith("Acces non autorise par le patient");
  });

  it("le patient autorise, le médecin ajoute, le patient lit", async () => {
    await c.connect(patient).grantAccess(doctor.address, 0);
    await expect(
      c.connect(doctor).addRecord(patient.address, Consultation, "Consultation", hash, "ipfs://x")
    ).to.emit(c, "RecordAdded");
    const recs = await c.connect(patient).getRecords(patient.address);
    expect(recs.length).to.equal(1);
    expect(recs[0].fileHash).to.equal(hash);
  });

  it("révocation : le médecin perd l'accès", async () => {
    await c.connect(patient).grantAccess(doctor.address, 0);
    await c.connect(patient).revokeAccess(doctor.address);
    expect(await c.hasAccess(patient.address, doctor.address)).to.equal(false);
    await expect(c.connect(doctor).getRecords(patient.address))
      .to.be.revertedWith("Lecture non autorisee");
  });

  it("l'accès temporaire expire", async () => {
    await c.connect(patient).grantAccess(doctor.address, 3600);
    expect(await c.hasAccess(patient.address, doctor.address)).to.equal(true);
    await time.increase(3601);
    expect(await c.hasAccess(patient.address, doctor.address)).to.equal(false);
  });

  it("un étranger ne peut pas lire le dossier", async () => {
    await expect(c.connect(stranger).getRecords(patient.address))
      .to.be.revertedWith("Lecture non autorisee");
  });

  it("le laboratoire enregistre une analyse", async () => {
    await c.connect(patient).grantAccess(lab.address, 0);
    await c.connect(lab).addRecord(patient.address, Analysis, "NFS", hash, "ipfs://y");
    const recs = await c.connect(patient).getRecords(patient.address);
    expect(recs[0].recordType).to.equal(Analysis);
  });

  it("vérification d'intégrité par hash", async () => {
    await c.connect(patient).grantAccess(doctor.address, 0);
    await c.connect(doctor).addRecord(patient.address, Consultation, "C1", hash, "ipfs://x");
    expect(await c.connect(patient).verifyRecord(patient.address, 0, hash)).to.equal(true);
    const fake = ethers.keccak256(ethers.toUtf8Bytes("modifie"));
    expect(await c.connect(patient).verifyRecord(patient.address, 0, fake)).to.equal(false);
  });
});
