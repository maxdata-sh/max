import { Schema } from "@max/core";
import { AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask } from "./entities.js";

export const AcmeSchema = Schema.create({
  namespace: "acme",
  entities: [AcmeUser, AcmeWorkspace, AcmeRoot, AcmeProject, AcmeTask],
  roots: [AcmeRoot],
});
