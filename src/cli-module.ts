import { Command } from "commander";
import { runCommand } from "@decaf-ts/utils";
import { Logging } from "@decaf-ts/logging";

enum Projects {
  NEST_PROJECT = "nest-project",
}

enum Types {
  CONTROLLER = "page",
  SCHEMATICS = "schematics",
}

const logger = Logging.for("nestjs-cli");

/**
 * Creates and returns a Command object for the Angular CLI module in decaf-ts.
 * This function sets up a 'generate' command that can create various Angular artifacts.
 *
 * @returns {Command} A Command object configured with the 'generate' subcommand and its action.
 *
 * The command syntax is: generate <type> <name> [project]
 * @param {Types} type - The type of artifact to generate (e.g., service, component, directive, page).
 * @param {string} name - The name of the artifact to be generated.
 * @param {Projects} [project=Projects.FOR_ANGULAR] - The project for which to generate the artifact.
 *                   Defaults to the main Angular project if not specified.
 *
 * @throws {Error} If an invalid type is provided.
 *
 * @example
 * // Usage in CLI
 * // decaf-ts generate service my-service
 * // decaf-ts generate component my-component for-angular-app
 */
export default function nest() {
  return new Command()
    .name("nest")
    .command("generate <type> <name> [project]")
    .description(`decaf-ts NestJS CLI module`)
    .action(
      async (
        type: Types,
        name: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        project: Projects = Projects.NEST_PROJECT
      ) => {
        if (!validateType(type))
          return logger.error(
            `${type} is not valid. Use service, component or directive.`
          );
        //
        //   if (type === Types.SCHEMATICS) return await generateSchematics();
        //
        //   if (type === Types.CONTROLLER) {
        //     logger.info(
        //       `Pages can be only generate for app. Forcing project to: ${Projects.FOR_ANGULAR_APP}`
        //     );
        //     project = Projects.FOR_ANGULAR_APP;
        //   }
        //
        //   (project as string) = parseProjectName(project);
        //
        //   if (!validateProject(project)) project = Projects.NEST_PROJECT;
        //   const command =
        //     project === Projects.FOR_ANGULAR_APP
        //       ? "ionic generate"
        //       : `ng generate --project=${Projects.NEST_PROJECT} --path=src/lib/${type}s`;
        //
        //   try {
        //     const result = await execute(`${command} ${type} ${name}`);
        //     logger.info(result as string);
        //   } catch (error: any) {
        //     logger.error(error?.message || error);
        //   }
      }
    );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateSchematics() {
  return Promise.all([
    execute(`npm link schematics`),
    execute(`cd schematics`),
    execute(`npm install`),
    execute(`npm run build`),
    execute(`npx schematics .:schematics --name=decaf`),
  ])
    .then((res) => res)
    .catch((error) => error);
}

/**
 * Executes a shell command asynchronously.
 *
 * @param command - The shell command to execute.
 * @returns A Promise that resolves with the command's stdout output as a string if successful,
 *          or rejects with an error message if the command fails or produces stderr output.
 */
async function execute(command: string): Promise<string | void> {
  try {
    return await runCommand(command).promise;
  } catch (error: any) {
    logger.error(error?.message || error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseProjectName(value: string): string {
  return value.toLowerCase();
}

/**
 * Validates if the given type value is a valid enum member of Types.
 *
 * @param value - The type value to validate.
 * @returns A boolean indicating whether the value is a valid Types enum member.
 */
function validateType(value: Types): boolean {
  return Object.values(Types).includes(value);
}

/**
 * Validates if the given project value is a valid enum member of Projects.
 *
 * @param value - The project value to validate.
 * @returns A boolean indicating whether the value is a valid Projects enum member.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validateProject(value: string): boolean {
  return Object.values(Projects).includes(value as Projects);
}
