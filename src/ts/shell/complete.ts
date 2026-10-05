import Directory from "../fs/directory";
import * as Path from "../fs/path";
import type Shell from "./shell";

export interface Completion {
    // The input line with the word under the cursor completed as far as possible.
    line: string;
    // Where the cursor should go in `line`.
    cursor: number;
    // All candidates, shown when the completion is ambiguous.
    options: string[];
}

function commonPrefix(items: string[]): string {
    let prefix = items[0] ?? '';
    for (const item of items) {
        while (!item.startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
        }
    }
    return prefix;
}

// Completes the word that ends at `cursor`: a command name if it is the first
// word of a command, otherwise a path. Quoting is not taken into account.
export function complete(shell: Shell, line: string, cursor: number): Completion {
    const before = line.slice(0, cursor);
    const start = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1;
    const word = before.slice(start);
    // Command position: nothing but whitespace since the start or the last | ; &.
    const isCommand = before.slice(0, start).replace(/.*[|;&]/, '').trim() === '';

    let candidates: string[];
    let prefix: string;
    let display: (candidate: string) => string;

    if (isCommand && !word.includes('/')) {
        prefix = '';
        candidates = shell.commandNames().filter(name => name.startsWith(word)).map(name => name + ' ');
        display = c => c.trim();
    } else {
        const slash = word.lastIndexOf('/');
        prefix = word.slice(0, slash + 1);
        const partial = word.slice(slash + 1);
        let dirPath = prefix === '' ? '.' : prefix;
        if (dirPath.startsWith('~')) {
            dirPath = shell.home + dirPath.slice(1);
        }
        const dir = shell.fs.find(dirPath);
        candidates = [];
        if (dir instanceof Directory) {
            for (const name of dir.list()) {
                if (!name.startsWith(partial) || (name.startsWith('.') && !partial.startsWith('.'))) {
                    continue;
                }
                candidates.push(name + (dir.getFile(name) instanceof Directory ? '/' : ' '));
            }
        }
        display = c => Path.basename(c.trim()) + (c.endsWith('/') ? '/' : '');
    }

    let completed = word;
    if (candidates.length === 1) {
        completed = prefix + candidates[0];
    } else if (candidates.length > 1) {
        completed = prefix + commonPrefix(candidates.map(c => c.trimEnd()));
    }
    const newBefore = before.slice(0, start) + completed;
    return {
        line: newBefore + line.slice(cursor),
        cursor: newBefore.length,
        options: candidates.length > 1 ? candidates.map(display) : [],
    };
}
