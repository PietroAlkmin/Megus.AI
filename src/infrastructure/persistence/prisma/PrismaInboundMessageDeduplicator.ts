import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import type { IInboundMessageDeduplicator } from "../../../domain/ports/repositories";

export class PrismaInboundMessageDeduplicator implements IInboundMessageDeduplicator {
  async claim(integrationId: string, providerMessageId: string): Promise<boolean> {
    try {
      await prisma.processedInboundMessage.create({
        data: { id: randomUUID(), integrationId, providerMessageId },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }
}
