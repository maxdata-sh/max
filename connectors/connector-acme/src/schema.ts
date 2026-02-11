import { Schema } from "@max/core";
import { AcmeUser, AcmeTeam, AcmeRoot, AcmeProject, AcmeTask } from "./entities.js";

export const AcmeSchema = Schema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeTeam, AcmeRoot, AcmeProject, AcmeTask],
  roots: [AcmeRoot],
});
