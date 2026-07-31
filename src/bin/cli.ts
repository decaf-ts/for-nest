import nest from "../cli-module";

void nest()
  .parseAsync(process.argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
