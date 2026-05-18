# get-windows (cli)

A CLI wrapper around [`get-windows`](https://www.npmjs.com/package/get-windows): print metadata
about the active window — or every open window — straight from the shell.

## Install

```sh
bun install -g https://github.com/soraxas/get-windows-cli
```

Or you can install it locally. This is a Bun project. From inside the repo:

```bash
bun install

# Run without installing
bun run cli.ts

# Install globally as `get-windows`
bun link            # in this directory
bun link get-windows-cli   # in any other directory

# Or add it as a global package by path
bun add -g .
```

After linking, the binary is on your `$PATH`:

```bash
get-windows --help
```

## Usage

```text
get-windows [options]

  -a, --all                          Print every open window (front to back)
  -w, --watch                        Poll repeatedly and reprint on every tick
  -i, --interval <ms>                Poll interval for --watch (default: 1000)
  -f, --field <path>                 Print one field by dot-path (e.g. "title", "owner.name")
  -r, --raw                          Emit raw JSON instead of the pretty CLI view
      --no-color                     Disable ANSI color (auto-disabled when piped)
      --sync                         Use the synchronous API
      --no-accessibility-permission  macOS: skip the accessibility prompt (drops "url")
      --no-screen-recording-permission
                                     macOS: skip the screen-recording prompt (drops "title")
  -h, --help                         Show this help and exit
  -v, --version                      Print version and exit
```

## Examples

Pretty CLI view of the active window (keys sorted, colored when stdout is a TTY):

```bash
get-windows
```

```text
bounds:
  height:  900
  width:   1440
  x:       0
  y:       0
id:           5762
memoryUsage:  11015432
owner:
  bundleId:   com.google.Chrome
  name:       Google Chrome
  path:       /Applications/Google Chrome.app
  processId:  310
platform:     macos
title:        Unicorns - Google Search
url:          https://sindresorhus.com/unicorn
```

Just one field — friendly to pipes:

```bash
get-windows --field title
get-windows --field owner.bundleId
```

Every open window:

```bash
get-windows --all
```

Raw JSON (sorted keys), pipe it to `jq`:

```bash
get-windows --raw --all | jq '.[] | .owner.name'
```

Watch the foreground app every half-second:

```bash
get-windows --watch --interval 500 --field title
```

## Programmatic use

If you just want the API, use [`get-windows`](https://www.npmjs.com/package/get-windows) directly:

```ts
import {activeWindow} from 'get-windows';

console.log(await activeWindow());
```
