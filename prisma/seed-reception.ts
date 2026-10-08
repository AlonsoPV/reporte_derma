import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo123!', 10);
  const user = await prisma.user.upsert({
    where: { email: 'recepcion@clinicademo.local' },
    update: {
      name: 'Recepción Demo',
      role: 'RECEPTION',
      status: 'ACTIVE',
      doctorId: null,
      passwordHash,
    },
    create: {
      name: 'Recepción Demo',
      email: 'recepcion@clinicademo.local',
      passwordHash,
      role: 'RECEPTION',
      status: 'ACTIVE',
    },
  });
  console.log(`OK ${user.email} ${user.role} ${user.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
