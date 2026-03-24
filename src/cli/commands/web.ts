import { Command } from "commander";
import { startServer } from "../../web/server.js";
import { resolveProject } from "../../core/project-resolver.js";
import { requireHub } from "../utils.js";

export const webCommand = new Command("web")
  .description("Start the AgentHive dashboard (local web UI)")
  .option("-p, --port <port>", "Port number", "4173")
  .option("--hub-path <path>", "Custom hub path")
  .action(async (options) => {
    requireHub(options.hubPath);
    const port = parseInt(options.port, 10);
    const project = await resolveProject(process.cwd(), options.hubPath);
    startServer(port, options.hubPath, project?.slug);
  });
