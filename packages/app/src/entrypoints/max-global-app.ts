import { GlobalContext } from "../context/contexts";
import {initCommand} from "../commands/init.js";


export class MaxGlobalApp {
  constructor(public globalContext: GlobalContext) {}

  async initProjectAtPath(params:{
    path: string
    force?: boolean
  }){
    console.log({params})
    return initCommand.run(params, this.globalContext)
  }
}


