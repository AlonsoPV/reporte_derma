export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  doctorId: string | null;
};

export type DayKpis = {
  scheduled: number;
  attended: number;
  pending: number;
  cancelledOrNoShow: number;
  amount: number;
  walkIns: number;
};

export type ImportPreviewSummary = {
  rowsDetected: number;
  newCount: number;
  existingCount: number;
  updatedCount: number;
  cancelledCount: number;
  errorCount: number;
  doctorsDetected: string[];
  unmappedDoctors: string[];
  errors: Array<{ row: number; message: string }>;
  missingColumns: string[];
};
