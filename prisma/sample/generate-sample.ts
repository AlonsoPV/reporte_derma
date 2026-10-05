import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Citas');

const headers = [
  'Fecha', 'Inicio', 'Fin', 'Duración', 'Nombre', 'Teléfono', 'Seguro',
  'Fecha de Nacimiento', 'Correo', 'Estado', 'Asistencia', 'Etiquetas',
  'Notas', 'Calendario', 'Doctor', 'ID cita',
];
sheet.addRow(headers);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

sheet.addRow([
  today, '14:00', '14:30', '30', 'Paciente Importado Uno', '5500000001', 'Particular',
  '1990-01-15', 'import1@test.com', 'Agendada', 'Confirmada', '',
  'Revisión', 'DermaMx', 'Berenice Gomez Tagle Boix', 'HULI-IMP-001',
]);
sheet.addRow([
  today, '15:00', '15:30', '30', 'Paciente Importado Dos', '5500000002', 'Seguro XYZ',
  '1985-05-20', 'import2@test.com', 'Agendada', 'Sin confirmar', '',
  'Láser', 'DermaMx', 'Carlos Mendoza Ruiz', 'HULI-IMP-002',
]);
sheet.addRow([
  today, '16:00', '16:30', '30', 'Paciente Cancelado', '5500000003', '',
  '', '', 'Cancelada', 'Confirmada', '',
  '', 'DermaMx', 'Ana Patricia Solís', 'HULI-IMP-003',
]);

const out = path.join(__dirname, 'sample_huli.xlsx');
await workbook.xlsx.writeFile(out);
console.log('Wrote', out);
