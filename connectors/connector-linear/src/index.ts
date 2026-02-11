import {ConnectorDef, ConnectorModule, Installation} from "@max/connector";
import {Context, EntityDef, ErrNotImplemented, type ScalarField, Schema, Seeder} from "@max/core";

interface LinearUser extends EntityDef<{
  name: ScalarField<"string">
}> {}

const LinearUser: LinearUser = EntityDef.create("LinearUser", {
  name: { kind: "scalar", type: "string" }
});

const LinearSchema = Schema.create({
  namespace: "linear",
  entities: [LinearUser],
  roots: [LinearUser],
});

class LinearContext extends Context {
  param = Context.string
}

const LinearDef = ConnectorDef.create({
  name: "linear",
  displayName: "Linear",
  description: "Placeholder linear connector -- not implemented!",
  icon: "",
  version: "0.1.0",
  scopes: [],
  schema: LinearSchema,
  seeder: Seeder.create({context: LinearContext, async seed(){
    throw ErrNotImplemented.create({}, "No seeder for linear because it's a placeholder")
  }}),
  resolvers: [],
});

export default ConnectorModule.create({
  def: LinearDef,
  initialise(_config, _credentials) {
    return Installation.create({ context: {} });
  },
});
