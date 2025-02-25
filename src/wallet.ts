import { Keypair } from '@mysten/sui/cryptography';
import fs from 'fs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';


export function fetchWallet(wallet_dir: string): Keypair {
  const walletData = JSON.parse(fs.readFileSync(wallet_dir, 'utf-8'));

  let keypair = Ed25519Keypair.fromSecretKey(walletData.privateKey);
  return keypair;
}

export function createWallet(keypair_path:string): Keypair {
  // Check if path ends in .json

  if (!keypair_path.endsWith('.json')) {
    throw new Error('Keypair path must end in .json');
  }

  // Create directory if it doesn't exist
  const dir = keypair_path.substring(0, keypair_path.lastIndexOf('/'));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check if file already exists
  if (fs.existsSync(keypair_path)) {
    throw new Error('Keypair file already exists at specified path');
  }

  // Generate new keypair
  const keypair = new Ed25519Keypair();

  // Create wallet data object
  const walletData = {
    privateKey: keypair.getSecretKey(),
    publicKey: keypair.getPublicKey().toSuiAddress(),
  };

  // Write wallet data to file
  fs.writeFileSync(keypair_path, JSON.stringify(walletData, null, 2));

  return keypair;
}

export const shio_wallet = (() => {
  try {
    return fetchWallet("./wallets/shio_wallet.json");
  } catch (e) {
    return createWallet("./wallets/shio_wallet.json");
  }
})();

export const normal_wallet = (() => {
  try {
    return fetchWallet("./wallets/normal_wallet.json");
  } catch (e) {
    return createWallet("./wallets/normal_wallet.json");
  }
})();

console.log(`Shio Wallet address: ${shio_wallet.getPublicKey().toSuiAddress()}`);
console.log(`Normal Wallet address: ${normal_wallet.getPublicKey().toSuiAddress()}`);
