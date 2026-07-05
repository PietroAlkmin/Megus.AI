import { describe, it } from "vitest";
import { InMemoryRepositories } from "../src/infrastructure/persistence/memory/InMemoryRepositories";
import { assertRepositoryContract } from "./repositoryContract";

describe("InMemoryRepositories — contrato", () => {
  it("cumpre o contrato (round-trip + IDOR)", async () => {
    const r = new InMemoryRepositories();
    await assertRepositoryContract({ contacts: r.contacts, conversations: r.conversations, emissions: r.emissions, services: r.services });
  });
});
