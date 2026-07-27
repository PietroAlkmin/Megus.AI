import type { ICalendarEventsReader } from "../../domain/ports/ICalendarEventsReader";
import type { CalendarEventInput } from "./CalendarEventParser";
import { CalendarImportPlanner, type CalendarImportPlanItem } from "./CalendarImportPlanner";
import { CalendarImportExecutor } from "./CalendarImportExecutor";

export class CalendarImportService {
  constructor(private readonly d: { reader: ICalendarEventsReader; planner: CalendarImportPlanner; executor: CalendarImportExecutor }) {}
  async preview(companyId: string, integrationId: string, timeMin: string): Promise<CalendarImportPlanItem[]> {
    return this.d.planner.plan(integrationId, await this.d.reader.listEvents(companyId, timeMin) as CalendarEventInput[]);
  }
  async confirm(integrationId: string, plan: CalendarImportPlanItem[]): Promise<number> {
    return this.d.executor.execute(integrationId, plan);
  }
}
