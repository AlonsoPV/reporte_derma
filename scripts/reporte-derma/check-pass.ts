import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const u = await p.user.findUnique({ where: { email: 'admin@clinicademo.local' } });
console.log('user', !!u, u?.email);
console.log('compare', await bcrypt.compare('Demo123!', u!.passwordHash));
console.log('hash', u!.passwordHash.slice(0, 30));
await p.$disconnect();
