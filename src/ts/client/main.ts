// Browser terminal: runs the shell entirely client-side and keeps its state in localStorage.

import { Chunk } from "../command";
import { complete } from "../shell/complete";
import Shell, { SerializedShell } from "../shell/shell";
import { createShell, motd } from "../system";

const STORAGE_KEY = 'pseudo-os:v1';

function load(): SerializedShell | undefined {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

function save(shell: Shell): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shell.serialize()));
    } catch {
        // Storage can be full or blocked; the session still works, it just won't persist.
    }
}

function boot(): Shell {
    const saved = load();
    if (saved) {
        try {
            return createShell(saved);
        } catch {
            // Saved state from an incompatible version: start fresh.
        }
    }
    return createShell();
}

const shell = boot();

const screen = document.getElementById('screen')!;
const scrollback = document.getElementById('scrollback')!;
const form = document.getElementById('line') as HTMLFormElement;
const input = document.getElementById('input') as HTMLInputElement;
const promptLabel = document.getElementById('prompt')!;
const title = document.getElementById('title')!;
const resetButton = document.getElementById('reset')!;

function span(text: string, className?: string): HTMLSpanElement {
    const el = document.createElement('span');
    el.textContent = text;
    if (className) {
        el.className = className;
    }
    return el;
}

// Fills `target` with a coloured prompt like "user@pseudo-os:~/docs$ ".
function renderPrompt(target: HTMLElement): void {
    const user = `${shell.variable('USER')}@${shell.variable('HOSTNAME')}`;
    target.replaceChildren(span(user, 'user'), span(':'), span(shell.displayCwd, 'cwd'), span('$ '));
}

function updatePrompt(): void {
    renderPrompt(promptLabel);
    title.textContent = `${shell.variable('USER')}@${shell.variable('HOSTNAME')}: ${shell.displayCwd}`;
}

function print(text: string, className?: string): void {
    scrollback.append(span(text, className));
}

function printChunks(chunks: Chunk[]): void {
    for (const chunk of chunks) {
        print(chunk.text, chunk.error ? 'error' : undefined);
    }
}

// Echoes the submitted line into the scrollback, prompt included.
function echoLine(line: string, suffix = ''): void {
    const echo = document.createElement('span');
    renderPrompt(echo);
    echo.append(span(line), span(suffix + '\n', 'muted'));
    scrollback.append(echo);
}

function scrollToEnd(): void {
    screen.scrollTop = screen.scrollHeight;
}

// Index into shell.history while browsing with the arrow keys; history.length means "the new line".
let historyIndex = shell.history.length;
let draft = '';

function run(line: string): void {
    echoLine(line);
    const result = shell.execute(line);
    if (result.clear) {
        scrollback.replaceChildren();
    }
    printChunks(result.chunks);
    historyIndex = shell.history.length;
    draft = '';
    updatePrompt();
    save(shell);
    scrollToEnd();
}

function setInput(value: string, cursor = value.length): void {
    input.value = value;
    input.setSelectionRange(cursor, cursor);
}

form.addEventListener('submit', event => {
    event.preventDefault();
    const line = input.value;
    input.value = '';
    run(line);
});

input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex === shell.history.length) {
            draft = input.value;
        }
        const step = event.key === 'ArrowUp' ? -1 : 1;
        historyIndex = Math.min(Math.max(historyIndex + step, 0), shell.history.length);
        setInput(historyIndex === shell.history.length ? draft : shell.history[historyIndex]);
    } else if (event.key === 'Tab') {
        event.preventDefault();
        const result = complete(shell, input.value, input.selectionStart ?? input.value.length);
        if (result.options.length > 0 && result.line === input.value) {
            echoLine(input.value);
            print(result.options.join('  ') + '\n');
            scrollToEnd();
        }
        setInput(result.line, result.cursor);
    } else if (event.ctrlKey && event.key === 'c' && input.selectionStart === input.selectionEnd) {
        event.preventDefault();
        echoLine(input.value, '^C');
        setInput('');
        historyIndex = shell.history.length;
        scrollToEnd();
    } else if (event.ctrlKey && event.key === 'l') {
        event.preventDefault();
        scrollback.replaceChildren();
    }
});

// Clicking anywhere on the screen focuses the input, unless the user is selecting text.
screen.addEventListener('mouseup', () => {
    if (!window.getSelection()?.toString()) {
        input.focus();
    }
});

resetButton.addEventListener('click', () => {
    if (confirm('Erase every change you made and restore the original files?')) {
        input.value = '';
        run('reset --yes');
        print(motd + '\n');
        input.focus();
    }
});

updatePrompt();
print(motd + '\n');
input.focus();
