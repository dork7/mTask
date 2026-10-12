import { runAnalyzeCommand } from './analyze-command.ts';
import { getAnthropicApiKey, getAnthropicModel, loadEnv } from './config.ts';
import { createAnalyzerClient } from './services/analyzer.ts';

loadEnv();

// The exit code is set, not `process.exit()` called, so a long JSON is written out
// before the process ends.
process.exitCode = await runAnalyzeCommand(process.argv.slice(2), {
  apiKey: getAnthropicApiKey(),
  model: getAnthropicModel(),
  createClient: createAnalyzerClient,
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
});
