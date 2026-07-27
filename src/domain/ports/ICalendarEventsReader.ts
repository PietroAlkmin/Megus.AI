/** Leitura da agenda da empresa, sem acoplamento ao provedor OAuth. */
export interface ICalendarEventsReader {
  listEvents(companyId: string, timeMin: string): Promise<unknown[]>;
}
