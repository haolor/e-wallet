/**
 * Seed database for development
 * Run from backend/: npm run seed
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
}

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/hki-wallet?replicaSet=rs0';
const SALT_ROUNDS = 12;

const UserSchema = new mongoose.Schema(
  {
    fullName: String,
    email: { type: String, unique: true },
    phone: { type: String, unique: true },
    passwordHash: String,
    isVerified: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    role: { type: String, default: 'user' },
  },
  { timestamps: true },
);

const WalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'VND' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const User = mongoose.model('User', UserSchema);
const Wallet = mongoose.model('Wallet', WalletSchema);

const SEED_USERS = [
  {
    fullName: 'Admin HKi',
    email: 'admin@hki-wallet.dev',
    phone: '0901234567',
    password: 'Admin@123456',
    balance: 10_000_000,
    role: 'admin',
  },
  {
    fullName: 'User A',
    email: 'usera@hki-wallet.dev',
    phone: '0912345678',
    password: 'User@123456',
    balance: 500_000,
    role: 'user',
  },
  {
    fullName: 'User B',
    email: 'userb@hki-wallet.dev',
    phone: '0923456789',
    password: 'User@123456',
    balance: 250_000,
    role: 'user',
  },
];

async function seed() {
  console.log('Connecting to', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
  console.log('MONGODB_URI:', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  await User.deleteMany({});
  await Wallet.deleteMany({});

  for (const u of SEED_USERS) {
    const { balance, password, ...info } = u;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      ...info,
      passwordHash,
    });

    await Wallet.create({
      userId: user._id,
      balance,
    });

    console.log(
      `OK ${info.email} (${info.role}) balance ${balance.toLocaleString('vi-VN')} VND`,
    );
  }

  await mongoose.disconnect();

  console.log('\nSeed hoàn tất.');
}

seed().catch((e) => {
  console.error('Seed thất bại:', e.message);
  process.exit(1);
});
