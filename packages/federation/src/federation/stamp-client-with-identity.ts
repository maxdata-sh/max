
import {MaxUrlLevel, Supervised} from "@max/core";
import { IdForLevel, WithClientIdentity } from '../protocols/with-client-identity.js'

// FIXME: This shouldn't need to exist. It's a workaround for the fact that right now, the _Supervisor_ is the thing that assigns ids.
//  Instead, we need a clearer separation. For now, what this does is mutably assign an id to a client instance, visible to the containing context
//  by virtue of the "WithClientIdentity" interface. Needs a small refactor, but blast radius is tiny.
export function stampClientWithIdentity<TLevel extends MaxUrlLevel, TClient extends Supervised>(
  unlabelled: TClient,
  id: IdForLevel<TLevel>
): TClient & WithClientIdentity<TLevel> {
  // add identity to the deployer client.
  // Rather than wrap in another service, we just attach the id directly
  Object.assign(unlabelled, { id })
  return unlabelled as TClient & WithClientIdentity<TLevel>
}
