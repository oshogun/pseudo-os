// POSIX-style path helpers. All functions work on plain strings.

export function isAbsolute(path: string): boolean {
    return path.startsWith('/');
}

// Splits a path into its non-empty components, dropping '.' entries.
export function split(path: string): string[] {
    return path.split('/').filter(part => part !== '' && part !== '.');
}

// Resolves `path` against `cwd`, collapsing '.' and '..'. Always returns an absolute path.
export function resolve(cwd: string, path: string): string {
    const base = isAbsolute(path) ? [] : split(cwd);
    for (const part of split(path)) {
        if (part === '..') {
            base.pop();
        } else {
            base.push(part);
        }
    }
    return '/' + base.join('/');
}

export function join(...parts: string[]): string {
    return parts.filter(p => p !== '').join('/').replace(/\/+/g, '/');
}

export function basename(path: string): string {
    const parts = split(path);
    return parts.length ? parts[parts.length - 1] : '/';
}

export function dirname(path: string): string {
    const parts = split(path);
    parts.pop();
    return (isAbsolute(path) ? '/' : '') + parts.join('/') || '.';
}
