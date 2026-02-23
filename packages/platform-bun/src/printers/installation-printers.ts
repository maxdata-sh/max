import {Printer} from "@max/core";
import { InstallationInfo } from '@max/federation'

export const InstallationInfoPrinter = Printer.define<InstallationInfo>((inst, fmt) =>
  Printer.lines([
    `${fmt.underline(inst.name)} ${fmt.dim(`[${inst.connector}]`)}`,
    `  ${fmt.normal('Id:')}    ${inst.id}`,
    `  ${fmt.normal('Since:')} ${inst.connectedAt}`,
  ])
)
