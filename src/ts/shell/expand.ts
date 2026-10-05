import Directory from "../fs/directory";
import FileSystem from "../fs/filesystem";
import * as Path from "../fs/path";
import { Word } from "./parser";

export interface ExpandContext {
    fs: FileSystem;
    // Looks up a variable; `?` is the last exit code.
    variable(name: string): string;
}

const variablePattern = /\$(\?|[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/g;

function expandVariables(text: string, ctx: ExpandContext): string {
    return text.replace(variablePattern, (_, name: string) => ctx.variable(name.replace(/^\{|\}$/g, '')));
}

// Escapes glob metacharacters so quoted text matches literally.
function escapeGlob(text: string): string {
    return text.replace(/[*?\\]/g, '\\$&');
}

// Expands one word into zero or more arguments: variables, a leading '~', then globs.
export function expandWord(word: Word, ctx: ExpandContext): string[] {
    let text = '';
    let pattern = '';
    word.forEach((part, index) => {
        let value = part.quoting === 'single' ? part.text : expandVariables(part.text, ctx);
        if (index === 0 && part.quoting === 'none' && /^~(\/|$)/.test(value)) {
            value = ctx.variable('HOME') + value.slice(1);
        }
        text += value;
        pattern += part.quoting === 'none' ? value : escapeGlob(value);
    });

    if (!/(^|[^\\])[*?]/.test(pattern)) {
        return [text];
    }
    const matches = glob(pattern, ctx.fs);
    return matches.length ? matches : [text];
}

function hasWildcard(component: string): boolean {
    return /(^|[^\\])[*?]/.test(component);
}

function unescape(component: string): string {
    return component.replace(/\\(.)/g, '$1');
}

function componentRegex(component: string): RegExp {
    let source = '';
    for (let i = 0; i < component.length; i++) {
        const ch = component[i];
        if (ch === '\\' && i + 1 < component.length) {
            source += component[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        } else if (ch === '*') {
            source += '[^/]*';
        } else if (ch === '?') {
            source += '[^/]';
        } else {
            source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`);
}

// Matches a glob pattern against the filesystem. Returns paths in the same
// form as the pattern (relative patterns give relative results), sorted.
export function glob(pattern: string, fs: FileSystem): string[] {
    const absolute = Path.isAbsolute(pattern);
    const components = pattern.split('/').filter(c => c !== '');
    let candidates: string[] = [absolute ? '/' : ''];

    components.forEach((component, index) => {
        const last = index === components.length - 1;
        const next: string[] = [];
        for (const prefix of candidates) {
            const dirPath = prefix === '' ? '.' : prefix;
            if (!hasWildcard(component)) {
                const candidate = Path.join(prefix, unescape(component));
                const node = fs.find(candidate);
                if (node && (last || node instanceof Directory)) {
                    next.push(candidate);
                }
                continue;
            }
            const dir = fs.find(dirPath);
            if (!(dir instanceof Directory)) {
                continue;
            }
            const regex = componentRegex(component);
            for (const name of dir.list()) {
                if (name.startsWith('.') && !component.startsWith('.')) {
                    continue;
                }
                const node = dir.getFile(name)!;
                if (regex.test(name) && (last || node instanceof Directory)) {
                    next.push(Path.join(prefix, name));
                }
            }
        }
        candidates = next;
    });

    return candidates.filter(c => c !== '' && c !== '/').sort();
}
