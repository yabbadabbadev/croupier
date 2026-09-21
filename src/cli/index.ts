import * as p from "@clack/prompts";
import chalk from "chalk";

async function main() {
  p.intro(chalk.bgMagenta.white.bold(" 🃏 @yabbadabbadev/croupier "));
  p.note("Deterministic Multi-Agent State Machine for Frontend Engineering");
  p.outro(chalk.green("Sistema listo para operar."));
}

main().catch(console.error);
