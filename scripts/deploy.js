const { ethers, network } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Déploiement avec :", deployer.address, "sur", network.name);

  const c = await (await ethers.getContractFactory("MedicalRecords")).deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("MedicalRecords déployé à :", address);

  // Exporte adresse + ABI pour l'interface web
  const artifact = await artifacts.readArtifact("MedicalRecords");
  fs.writeFileSync(
    "frontend/contract.json",
    JSON.stringify({ address, abi: artifact.abi, network: network.name }, null, 2)
  );
  console.log("frontend/contract.json mis à jour");
}

main().catch((e) => { console.error(e); process.exit(1); });
