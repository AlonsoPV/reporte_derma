import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HULI_EXPORT_COLUMNS } from '../../shared/huli';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Sheet2');
sheet.addRow([...HULI_EXPORT_COLUMNS]);

const fecha = '08/10/2026';
const calendar = 'DermaMx';

sheet.addRow([
  fecha, '9:00 AM', '9:30 AM', '00:30:00', 'Paciente Mañana Uno', '(+52) 5510000001', '-',
  '1990-01-15', 'import1@test.com', 'Agendada', 'Confirmada', '-',
  '1°', calendar, 'Berenice Gomez Tagle Boix', '80159501',
]);
sheet.addRow([
  fecha, '1:00 PM', '1:30 PM', '00:30:00', 'Paciente Tarde Dos', '(+52) 5510000002', '-',
  '1985-05-20', '-', 'Completada', 'Confirmada', '-',
  'sub', calendar, 'Luisa Fernanda Martínez Rosas Hijar', '80159502',
]);
sheet.addRow([
  fecha, '4:00 PM', '4:30 PM', '00:30:00', '-', '(+52) 5510000003', '-',
  '-', '-', 'Agendada', 'Sin confirmar', '-',
  '1°', calendar, 'María Alejandra Chacón Ruiz', '80159503',
]);
sheet.addRow([
  fecha, '6:30 PM', '7:00 PM', '00:30:00', 'Paciente Cancelado', '(+52) 5510000004', '-',
  '-', '-', 'Cancelada', 'Confirmada', '-',
  '-', calendar, 'Berenice Gomez Tagle Boix', '80159504',
]);
sheet.addRow([
  fecha, '2:00 PM', '2:30 PM', '00:30:00', 'Paciente No Show', '(+52) 5510000005', '-',
  '-', '-', 'Paciente no se presentó', 'Sin confirmar', '-',
  '-', calendar, 'Luisa Fernanda Martínez Rosas Hijar', '80159505',
]);
sheet.addRow([
  fecha, '3:00 PM', '3:30 PM', '00:30:00', 'Paciente Reagendado', '(+52) 5510000006', '-',
  '-', 'ferickg.sk@example.com', 'Reagendada', 'Sin confirmar', '-',
  '1° Retiro de verrugas', calendar, 'Luisa Fernanda Martínez Rosas Hijar', '80159506',
]);

const out = path.join(__dirname, 'sample_huli.xlsx');
await workbook.xlsx.writeFile(out);
console.log('Wrote', out);
