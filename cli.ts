#!/usr/bin/env bun
import {parseArgs} from 'node:util';
import {
	activeWindow,
	activeWindowSync,
	openWindows,
	openWindowsSync,
	type Options,
	type Result,
} from 'get-windows';
import pkg from './package.json' with {type: 'json'};

const HELP = `\
get-windows — print metadata about the active (or all) window(s)

Usage:
  get-windows [options]

Options:
  -a, --all                          Print every open window (front to back)
  -w, --watch                        Poll repeatedly and reprint on every tick
  -i, --interval <ms>                Poll interval for --watch (default: 1000)
  -f, --field <path>                 Print one field by dot-path (e.g. "title", "owner.name")
  -r, --raw                          Emit raw JSON instead of the pretty CLI view
      --no-color                     Disable ANSI color (auto-disabled when stdout is not a TTY)
      --sync                         Use the synchronous API
      --no-accessibility-permission  macOS: skip the accessibility prompt (drops "url")
      --no-screen-recording-permission
                                     macOS: skip the screen-recording prompt (drops "title")
  -h, --help                         Show this help and exit
  -v, --version                      Print version and exit

Examples:
  get-windows                        # pretty CLI view of the active window
  get-windows --raw                  # JSON, sorted keys
  get-windows --field title          # just the title
  get-windows --all                  # every open window
  get-windows --watch -i 500 -f title  # poll the active title every 500 ms
`;

const ANSI = {
	reset: '[0m',
	bold: '[1m',
	dim: '[2m',
	cyan: '[36m',
	green: '[32m',
	yellow: '[33m',
	magenta: '[35m',
	blue: '[34m',
	gray: '[90m',
};

function die(message: string, code = 1): never {
	process.stderr.write(`get-windows: ${message}\n`);
	process.exit(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortKeys<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(item => sortKeys(item)) as unknown as T;
	}

	if (isPlainObject(value)) {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
		}

		return sorted as unknown as T;
	}

	return value;
}

function pickField(value: unknown, path: string): unknown {
	let current: unknown = value;
	for (const segment of path.split('.')) {
		if (current == null || typeof current !== 'object') {
			return undefined;
		}

		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

function colorize(useColor: boolean, code: string, text: string): string {
	return useColor ? `${code}${text}${ANSI.reset}` : text;
}

function paintValue(value: unknown, useColor: boolean): string {
	if (value === null) {
		return colorize(useColor, ANSI.gray, 'null');
	}

	if (value === undefined) {
		return colorize(useColor, ANSI.gray, '—');
	}

	if (typeof value === 'string') {
		return colorize(useColor, ANSI.green, value);
	}

	if (typeof value === 'number') {
		return colorize(useColor, ANSI.yellow, String(value));
	}

	if (typeof value === 'boolean') {
		return colorize(useColor, ANSI.magenta, String(value));
	}

	return String(value);
}

function paintFieldValue(value: unknown, useColor: boolean): string {
	if (value === undefined) {
		return '';
	}

	if (typeof value === 'string') {
		// Don't color a single-field string — it's almost always being piped.
		return value;
	}

	if (isPlainObject(value) || Array.isArray(value)) {
		return renderTree(value, useColor);
	}

	return paintValue(value, useColor);
}

function renderTree(value: unknown, useColor: boolean, indent = 0): string {
	const pad = '  '.repeat(indent);

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return `${pad}${colorize(useColor, ANSI.gray, '(empty)')}`;
		}

		const lines: string[] = [];
		for (const [index, item] of value.entries()) {
			const marker = colorize(useColor, ANSI.bold + ANSI.blue, '·');
			lines.push(`${pad}${marker} ${colorize(useColor, ANSI.dim, `#${index + 1}`)}`);
			lines.push(renderTree(item, useColor, indent + 1));
			if (index < value.length - 1) {
				lines.push('');
			}
		}

		return lines.join('\n');
	}

	if (!isPlainObject(value)) {
		return `${pad}${paintValue(value, useColor)}`;
	}

	const keys = Object.keys(value).sort();
	const leafKeys = keys.filter(key => !isPlainObject(value[key]) && !Array.isArray(value[key]));
	const maxLeafLength = leafKeys.reduce((maximum, key) => Math.max(maximum, key.length), 0);

	const lines: string[] = [];
	for (const key of keys) {
		const child = value[key];
		if (isPlainObject(child) || Array.isArray(child)) {
			lines.push(`${pad}${colorize(useColor, ANSI.bold + ANSI.cyan, `${key}:`)}`);
			lines.push(renderTree(child, useColor, indent + 1));
		} else {
			const label = `${key}:`.padEnd(maxLeafLength + 2);
			lines.push(`${pad}${colorize(useColor, ANSI.cyan, label)} ${paintValue(child, useColor)}`);
		}
	}

	return lines.join('\n');
}

function renderResult(
	result: Result | Result[] | undefined,
	{raw, useColor, field}: {raw: boolean; useColor: boolean; field: string | undefined},
): string {
	if (result === undefined) {
		if (field) {
			return '';
		}

		return raw ? 'null' : colorize(useColor, ANSI.gray, '(no active window)');
	}

	if (field) {
		if (Array.isArray(result)) {
			return result.map(item => paintFieldValue(pickField(item, field), useColor)).join('\n');
		}

		return paintFieldValue(pickField(result, field), useColor);
	}

	const sorted = sortKeys(result);

	if (raw) {
		return JSON.stringify(sorted, undefined, 2);
	}

	if (Array.isArray(sorted)) {
		return sorted
			.map((window_, index) => {
				const header = colorize(
					useColor,
					ANSI.bold + ANSI.blue,
					`── window ${index + 1}/${sorted.length} ──`,
				);
				return `${header}\n${renderTree(window_, useColor)}`;
			})
			.join('\n\n');
	}

	return renderTree(sorted, useColor);
}

let parsed;
try {
	parsed = parseArgs({
		options: {
			all: {type: 'boolean', short: 'a'},
			watch: {type: 'boolean', short: 'w'},
			interval: {type: 'string', short: 'i'},
			field: {type: 'string', short: 'f'},
			raw: {type: 'boolean', short: 'r'},
			color: {type: 'boolean'},
			sync: {type: 'boolean'},
			'accessibility-permission': {type: 'boolean', default: true},
			'screen-recording-permission': {type: 'boolean', default: true},
			help: {type: 'boolean', short: 'h'},
			version: {type: 'boolean', short: 'v'},
		},
		strict: true,
		allowNegative: true,
	});
} catch (error) {
	die(error instanceof Error ? error.message : String(error), 2);
}

const {values} = parsed;

if (values.help) {
	process.stdout.write(HELP);
	process.exit(0);
}

if (values.version) {
	process.stdout.write(`${pkg.version}\n`);
	process.exit(0);
}

const intervalMs = values.interval === undefined ? 1000 : Number(values.interval);
if (!Number.isFinite(intervalMs) || intervalMs < 0) {
	die(`invalid --interval: ${values.interval}`, 2);
}

const useColor = (() => {
	if (values.color === false) {
		return false;
	}

	if (values.color === true) {
		return true;
	}

	if (process.env.NO_COLOR) {
		return false;
	}

	return Boolean(process.stdout.isTTY);
})();

const options: Options = {
	accessibilityPermission: values['accessibility-permission'] ?? true,
	screenRecordingPermission: values['screen-recording-permission'] ?? true,
};

async function fetchOnce(): Promise<Result | Result[] | undefined> {
	if (values.all) {
		return values.sync ? openWindowsSync(options) : await openWindows(options);
	}

	return values.sync ? activeWindowSync(options) : await activeWindow(options);
}

async function runOnce(): Promise<void> {
	const result = await fetchOnce();
	const output = renderResult(result, {raw: Boolean(values.raw), useColor, field: values.field});
	process.stdout.write(`${output}\n`);
	if (result === undefined && !values.field) {
		process.exit(1);
	}
}

async function runWatch(): Promise<void> {
	let stopping = false;
	const stop = () => {
		stopping = true;
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);

	let first = true;
	while (!stopping) {
		try {
			const result = await fetchOnce();
			const output = renderResult(result, {
				raw: Boolean(values.raw),
				useColor,
				field: values.field,
			});

			if (!first && !values.raw && !values.field) {
				const rule = colorize(useColor, ANSI.gray, '─'.repeat(40));
				process.stdout.write(`\n${rule}\n`);
			}

			process.stdout.write(`${output}\n`);
			first = false;
		} catch (error) {
			process.stderr.write(
				`get-windows: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}

		if (stopping || intervalMs === 0) {
			break;
		}

		await Bun.sleep(intervalMs);
	}
}

if (values.watch) {
	await runWatch();
} else {
	await runOnce();
}
