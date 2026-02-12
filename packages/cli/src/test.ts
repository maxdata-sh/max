import { object, or } from "@optique/core/constructs";
import { multiple } from "@optique/core/modifiers";
import {InferValue, suggest, suggestAsync} from "@optique/core/parser";
import { argument, command, constant, option} from "@optique/core/primitives";
import { path, run } from "@optique/run";
import {choice, string} from "@optique/core/valueparser";
import {runParser} from "@optique/core";

const parser = or(
  command("add", object({
    type: constant("add"),
    files: argument(choice(['one','two'])),
    all: option("-A", "--all"),
    force: option("-f", "--force")
  })),
  command("commit", object({
    type: constant("commit"),
    message: option("-m", "--message", string()),
    amend: option("--amend"),
    all: option("-a", "--all")
  })),
  command("push", object({
    type: constant("push"),
    remote: option("-r", "--remote", string()),
    force: option("-f", "--force"),
    setUpstream: option("-u", "--set-upstream")
  }))
);

// TypeScript creates a perfect discriminated union
type GitCommand = InferValue<typeof parser>;

// const result1 = run(parser,"completion"["add","one"],{completion:{mode:'command'}});
const result = suggestAsync(parser, ['add','one','']).then(r => console.log(r))

run(parser, {
  args: ["completion","zsh", "add", "one","one",""],
  completion: {mode:'command'},

})
