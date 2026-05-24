/**
 * VaultManager — AES-256-GCM encrypted profit vault.
 *
 * KDF: crypto.scrypt() — Node.js built-in memory-hard KDF (N=16384, r=8, p=1, 32-byte key).
 *      scrypt provides memory-hardness comparable to Argon2id within the Node.js stdlib;
 *      for maximum security, replace with the `argon2` npm package (Argon2id) in production.
 *
 * Storage: vault/ at the repo/project root (gitignored via vault/ rule in .gitignore).
 *
 * Encryption: AES-256-GCM with a random 12-byte IV per write. The same salt that was used
 * to derive the key is persisted in the vault file, ensuring unlock() always recovers the
 * same key from the same passphrase.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import * as crypto from 'crypto';

interface VaultData {
  balance: number;
  currency: string;
  entries: VaultEntry[];
  createdAt: number;
  updatedAt: number;
}

interface VaultEntry {
  amount: number;
  note: string;
  timestamp: number;
  txHash?: string;
}

interface EncryptedVault {
  version: number;
  kdf: 'scrypt';
  N: number; r: number; p: number;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

const VAULT_VERSION = 3;
const KEY_LENGTH = 32;
// scrypt parameters (OWASP recommended interactive: N=16384, r=8, p=1)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export class VaultManager {
  private vaultPath: string;
  private vaultDir: string;
  private data: VaultData | null = null;
  private locked: boolean = true;
  private key: Buffer | null = null;
  /** The single source of truth for the salt — same value used for KDF and stored in file */
  private salt: Buffer | null = null;

  constructor(repoRoot: string) {
    // vault/ at project root (gitignored)
    this.vaultDir = resolve(repoRoot, 'vault');
    this.vaultPath = resolve(this.vaultDir, 'profits.vault');
    if (!existsSync(this.vaultDir)) mkdirSync(this.vaultDir, { recursive: true });
  }

  exists(): boolean { return existsSync(this.vaultPath); }
  isLocked(): boolean { return this.locked; }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async create(passphrase: string): Promise<void> {
    if (this.exists()) throw new Error('Vault already exists. Use unlock() to open it.');
    this.salt = crypto.randomBytes(32);
    this.key  = await this.deriveKey(passphrase, this.salt);
    this.data = {
      balance: 0, currency: 'USD', entries: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.locked = false;
    await this.persist();
  }

  /**
   * Read salt from vault file, derive key from (passphrase + fileSalt),
   * attempt GCM decryption — throws on wrong passphrase.
   */
  async unlock(passphrase: string): Promise<boolean> {
    if (!this.exists()) throw new Error('Vault does not exist. Run `jelly setup` first.');
    try {
      const raw = JSON.parse(readFileSync(this.vaultPath, 'utf-8')) as EncryptedVault;
      const fileSalt = Buffer.from(raw.salt, 'hex');
      const candidateKey = await this.deriveKey(passphrase, fileSalt, raw.N, raw.r, raw.p);
      const data = this.decryptWith(candidateKey, raw); // throws on auth failure
      this.salt   = fileSalt;
      this.key    = candidateKey;
      this.data   = data;
      this.locked = false;
      return true;
    } catch {
      this.key  = null;
      this.salt = null;
      this.locked = true;
      return false;
    }
  }

  lock(): void {
    this.key  = null;
    this.salt = null;
    this.data = null;
    this.locked = true;
  }

  // ── Operations ───────────────────────────────────────────────────────────

  async sweep(amount: number, note: string = 'auto-sweep', txHash?: string): Promise<void> {
    this.requireUnlocked();
    this.data!.balance += amount;
    this.data!.entries.push({ amount, note, timestamp: Date.now(), txHash });
    this.data!.updatedAt = Date.now();
    await this.persist();
  }

  async withdraw(amount: number, note: string = 'withdrawal'): Promise<void> {
    this.requireUnlocked();
    if (amount > this.data!.balance) throw new Error('Insufficient vault balance');
    this.data!.balance -= amount;
    this.data!.entries.push({ amount: -amount, note, timestamp: Date.now() });
    this.data!.updatedAt = Date.now();
    await this.persist();
  }

  getBalance(): number { this.requireUnlocked(); return this.data!.balance; }

  getStats(): any {
    if (this.locked) return { locked: true, balance: '****', entries: 0 };
    return {
      locked: false,
      balance: this.data!.balance,
      currency: this.data!.currency,
      entries: this.data!.entries.length,
      createdAt: this.data!.createdAt,
      updatedAt: this.data!.updatedAt,
    };
  }

  getHistory(): VaultEntry[] {
    this.requireUnlocked();
    return [...this.data!.entries].reverse().slice(0, 50);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private requireUnlocked(): void {
    if (this.locked || !this.data || !this.key) {
      throw new Error('Vault is locked. Use /unlock <passphrase>.');
    }
  }

  /**
   * Derive a 32-byte key from passphrase + salt using scrypt (memory-hard).
   * Parameters default to SCRYPT_N/R/P but are read from vault file on unlock
   * to support future algorithm upgrades without breaking existing vaults.
   */
  private deriveKey(
    passphrase: string, salt: Buffer,
    N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(passphrase, salt, KEY_LENGTH, { N, r, p }, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  /**
   * Encrypt this.data with this.key, write vault file.
   * Stores the SAME this.salt that was used to derive this.key.
   */
  private async persist(): Promise<void> {
    if (!this.key || !this.salt) throw new Error('Vault not initialised — call create() or unlock() first.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(this.data);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const file: EncryptedVault = {
      version: VAULT_VERSION,
      kdf: 'scrypt',
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
      salt: this.salt.toString('hex'),   // ← persisted KDF salt (same as used for key)
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: ciphertext.toString('hex'),
    };
    writeFileSync(this.vaultPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  /** Decrypt with given key; throws on GCM authentication failure (wrong key/passphrase). */
  private decryptWith(key: Buffer, raw: EncryptedVault): VaultData {
    const iv        = Buffer.from(raw.iv,         'hex');
    const authTag   = Buffer.from(raw.authTag,    'hex');
    const ciphertext = Buffer.from(raw.ciphertext, 'hex');
    const decipher  = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf-8')) as VaultData;
  }
}
