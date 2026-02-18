import {Id} from "./brand.js";
import {StaticTypeCompanion} from "./companion.js";

export type ISODateString = Id<'iso-date'>

export const ISODateString = StaticTypeCompanion({
  now(): ISODateString {
    return new Date().toISOString()
  }
})
