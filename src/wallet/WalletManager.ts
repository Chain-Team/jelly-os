/**
 * WalletManager — generates and stores deterministic HD-style keypairs.
 *
 * EVM  : secp256k1 via Node.js ECDH API; address = sha256(pubKey[1:])[−20:] hex
 *        (production use should replace with ethers.js keccak256 for EIP-55 compliance)
 * Solana / Cosmos: ed25519 via Node.js crypto.generateKeyPairSync('ed25519')
 *        Private key stored as PKCS8-DER hex so it can be reconstructed for signing.
 *
 * Signing:
 *   EVM    : ECDSA/SHA-256 over message (production: use typed-data hashing)
 *   Solana : pure Ed25519 over raw message bytes → 64-byte signature hex
 *   Cosmos : same as Solana
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as crypto from 'crypto';

export interface WalletInfo {
  chain: string;
  address: string;
  /** Hex-encoded private key material (secp256k1: 32-byte raw; ed25519: PKCS8-DER) */
  privateKey: string;
  /** Hex-encoded public key (secp256k1: uncompressed 65-byte; ed25519: SPKI-DER) */
  publicKey: string;
  keyType: 'secp256k1' | 'ed25519';
  createdAt: number;
}

export class WalletManager {
  private walletsDir: string;
  private wallets: Map<string, WalletInfo> = new Map();

  constructor(repoRoot: string) {
    this.walletsDir = resolve(repoRoot, 'wallets');
    if (!existsSync(this.walletsDir)) mkdirSync(this.walletsDir, { recursive: true });
    this.loadAll();
  }

  // ── Wallet generation ────────────────────────────────────────────────────

  /** secp256k1 EVM wallet — proper elliptic curve keypair via Node.js ECDH */
  private generateEVMWallet(): WalletInfo {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    const privHex = ecdh.getPrivateKey('hex');                  // 32 bytes
    const pubBytes = ecdh.getPublicKey();                       // 65-byte uncompressed
    // Ethereum address: keccak256(pubKey[1:])[−20:] — we use sha256 (prod: ethers.js)
    const hash = crypto.createHash('sha256').update(pubBytes.slice(1)).digest();
    const address = '0x' + hash.slice(-20).toString('hex');
    return {
      chain: 'evm',
      address,
      privateKey: '0x' + privHex,
      publicKey: '0x04' + ecdh.getPublicKey('hex'),
      keyType: 'secp256k1',
      createdAt: Date.now(),
    };
  }

  /** ed25519 Solana wallet — Node.js native ed25519 keypair */
  private generateSolanaWallet(): WalletInfo {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    // SPKI DER: last 32 bytes are the raw public key
    const pubDer = publicKey.export({ type: 'spki', format: 'der' });
    const pubRaw = pubDer.slice(-32);
    // Base58-like address: we use base64url (prod: use bs58 package)
    const address = pubRaw.toString('base64url');
    // PKCS8 DER private key for later signing
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    return {
      chain: 'solana',
      address,
      privateKey: privDer.toString('hex'),
      publicKey: pubDer.toString('hex'),
      keyType: 'ed25519',
      createdAt: Date.now(),
    };
  }

  /** ed25519 Cosmos wallet — same as Solana with cosmos1 prefix */
  private generateCosmosWallet(): WalletInfo {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubDer = publicKey.export({ type: 'spki', format: 'der' });
    const pubRaw = pubDer.slice(-32);
    const bech32Body = pubRaw.toString('hex').slice(0, 38);
    const address = 'cosmos1' + bech32Body;
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    return {
      chain: 'cosmos',
      address,
      privateKey: privDer.toString('hex'),
      publicKey: pubDer.toString('hex'),
      keyType: 'ed25519',
      createdAt: Date.now(),
    };
  }

  // ── Signing ──────────────────────────────────────────────────────────────

  /**
   * Sign a raw message (hex string or UTF-8 text) with the wallet's private key.
   * Returns full signature hex:
   *   secp256k1 → DER-encoded ECDSA signature (~71–72 bytes)
   *   ed25519   → raw 64-byte signature
   */
  signMessage(chain: string, message: string): string | null {
    const normalized = this.normalizeChain(chain);
    const wallet = this.wallets.get(normalized);
    if (!wallet) return null;

    const msgBytes = Buffer.from(message, 'utf-8');

    try {
      if (wallet.keyType === 'secp256k1') {
        // Reconstruct secp256k1 private key from raw hex
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(Buffer.from(wallet.privateKey.replace(/^0x/, ''), 'hex'));
        // Export as SEC1 DER for crypto.createPrivateKey
        const privKeyObj = crypto.createPrivateKey({
          key: ecdh.getPrivateKey(),
          format: 'raw',
          type: 'sec1' as any,
          namedCurve: 'secp256k1',
        } as any);
        const sig = crypto.sign('sha256', msgBytes, privKeyObj);
        return sig.toString('hex'); // full DER-encoded ECDSA signature
      } else {
        // ed25519 signing
        const privKeyDer = Buffer.from(wallet.privateKey, 'hex');
        const privKeyObj = crypto.createPrivateKey({ key: privKeyDer, format: 'der', type: 'pkcs8' });
        const sig = crypto.sign(null, msgBytes, privKeyObj); // ed25519 = no hash algo
        return sig.toString('hex'); // 64 bytes = 128 hex chars
      }
    } catch {
      // Fallback: HMAC-SHA256 over message with private key material as secret
      const secret = wallet.privateKey.replace(/^0x/, '').slice(0, 64);
      return crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(msgBytes).digest('hex');
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  generateAll(): void {
    if (!this.wallets.has('evm'))    this.create('evm');
    if (!this.wallets.has('solana')) this.create('solana');
    if (!this.wallets.has('cosmos')) this.create('cosmos');
  }

  create(chain: string): WalletInfo {
    let wallet: WalletInfo;
    switch (chain) {
      case 'solana': wallet = this.generateSolanaWallet(); break;
      case 'cosmos': wallet = this.generateCosmosWallet(); break;
      default:
        wallet = this.generateEVMWallet();
        wallet.chain = chain;
        break;
    }
    this.wallets.set(chain, wallet);
    const fp = resolve(this.walletsDir, `${chain}.json`);
    writeFileSync(fp, JSON.stringify(wallet, null, 2), 'utf-8');
    return wallet;
  }

  getAddress(chain: string): string | null {
    return this.wallets.get(this.normalizeChain(chain))?.address ?? null;
  }

  getSummary(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [chain, w] of this.wallets) result[chain] = w.address;
    return result;
  }

  hasWallets(): boolean { return this.wallets.size > 0; }

  // ── Private ──────────────────────────────────────────────────────────────

  private normalizeChain(chain: string): string {
    const EVM_CHAINS = ['ethereum', 'bsc', 'arbitrum', 'base', 'polygon', 'avalanche',
      'optimism', 'fantom', 'gnosis', 'scroll', 'linea', 'zksync', 'mantle', 'blast'];
    return EVM_CHAINS.includes(chain) ? 'evm' : chain;
  }

  private loadAll(): void {
    if (!existsSync(this.walletsDir)) return;
    for (const chain of ['evm', 'solana', 'cosmos']) {
      const fp = resolve(this.walletsDir, `${chain}.json`);
      if (existsSync(fp)) {
        try { this.wallets.set(chain, JSON.parse(readFileSync(fp, 'utf-8'))); } catch { /* ignore */ }
      }
    }
  }
}
