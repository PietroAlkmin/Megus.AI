export interface User {
  id: string;
  email: string;
  passwordHash: string;
  companyId: string; // tenant — isola os dados desta empresa
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}