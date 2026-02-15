import type { Suggestion } from "@optique/core/parser";
import type { CommandDefAny } from "@max/daemon";
import type { InferContext, Context } from "@max/core";
import type { Response } from "@max/daemon";
import { CliPrinter } from "../../app/src/daemon-manager.js";
import type { DaemonConfig } from "@max/daemon";
export declare class CommandRunner {
    private commands;
    private ctx;
    private cliName;
    private parsers;
    private daemon;
    private constructor();
    static create(commands: ReadonlyMap<string, CommandDefAny>, ctx: InferContext<Context>, cliName: string | undefined, config: DaemonConfig, printer?: CliPrinter): CommandRunner;
    private static shells;
    execute(argv: string[]): Promise<Response>;
    private allCommandSuggestions;
    suggest(argv: string[]): Promise<readonly Suggestion[]>;
    private generateHelp;
}
//# sourceMappingURL=command-runner.d.ts.map