import * as fs from "node:fs";
import * as util from "node:util";

/** Debug utility. Don't use. For emergencies! */
const LOG_PATH = '/tmp/max-escape.log'
export const BreakoutLogger = {
  log(...args:any[]){
    fs.writeFileSync(LOG_PATH, util.inspect(args) + '\n', { flag: 'a' })
  }
}
