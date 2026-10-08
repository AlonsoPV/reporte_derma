import { prisma } from '../../server/db';
import { DEMO_DATE, seedDemoDay } from '../../server/services/demo-day';
import { todayInMexico } from '../../server/utils';

async function main() {
  if (todayInMexico() !== DEMO_DATE) {
    throw new Error(`Este comando solo debe ejecutarse el ${DEMO_DATE}. Para cargar el día histórico, usa la acción de Administración.`);
  }
  console.log(`Datos demo de ${DEMO_DATE} cargados:`, await seedDemoDay());
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
