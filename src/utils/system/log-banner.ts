import messages from '../constants/messages';
import packageJson from '../../../package.json';

// Banner should always be shown, not conditional on DEBUG
const logBanner = async () => {
  const commit = process.env.COMMIT_HASH ?? 'unknown';
  const version = packageJson.version ?? 'unknown';
  const buildDate =
    process.env.BUILD_DATE && process.env.BUILD_DATE !== 'unknown'
      ? (() => {
          try {
            const date = new Date(process.env.BUILD_DATE);
            return !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
          } catch {
            return undefined;
          }
        })()
      : undefined;

  // Read the ASCII banner using Bun's native file API
  const banner = await Bun.file(`${import.meta.dir}/banner.txt`).text();

  // Build the info lines
  const infoLines = [
    '',
    messages.banner.madeWith,
    version !== 'unknown' ? messages.banner.version(version) : '',
    buildDate ? messages.banner.buildDate(buildDate.substring(0, 10)) : '',
    commit !== 'unknown' ? messages.banner.commit(commit.substring(0, 35)) : '',
  ].filter(Boolean);

  // Display banner and info
  console.log(banner);
  console.log(infoLines.join('\n'));
  if (commit !== 'unknown') {
    // Create a horizontal separator using Unicode box drawing characters
    // Try to get terminal width, fallback to 80 if not available
    const terminalWidth =
      process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
    const separator = '━'.repeat(terminalWidth);
    console.log(separator);
  }
  console.log('');
};

export default logBanner;
