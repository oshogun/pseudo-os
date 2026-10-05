// Tokenizer and parser for the shell's command language.
//
//   list      := pipeline ((';' | '&&' | '||') pipeline)* [';']
//   pipeline  := command ('|' command)*
//   command   := (word | redirect)+
//   redirect  := ('>' | '>>' | '<' | '2>' | '2>>') word | '2>&1'
//
// Words keep track of how each piece was quoted so that variable expansion,
// tilde expansion and globbing can be applied later, at execution time.

export type Quoting = 'none' | 'single' | 'double';

export interface WordPart {
    text: string;
    quoting: Quoting;
}

export type Word = WordPart[];

export type RedirectOp = '>' | '>>' | '<' | '2>' | '2>>' | '2>&1';
export type Connector = ';' | '&&' | '||';
type Operator = RedirectOp | Connector | '|';

export interface Redirect {
    op: RedirectOp;
    target: Word;
}

export interface SimpleCommand {
    words: Word[];
    redirects: Redirect[];
}

export type Pipeline = SimpleCommand[];

export interface ListItem {
    // How this pipeline is joined to the previous one; ';' for the first.
    connector: Connector;
    pipeline: Pipeline;
}

type Token = { type: 'word'; word: Word } | { type: 'op'; op: Operator };

export class ParseError extends Error {}

const operators: Operator[] = ['2>&1', '2>>', '&&', '||', '>>', '2>', '>', '<', '|', ';'];

export function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let word: Word = [];
    let inWord = false;
    let i = 0;

    const pushText = (text: string, quoting: Quoting) => {
        const last = word[word.length - 1];
        if (last && last.quoting === quoting) {
            last.text += text;
        } else {
            word.push({ text, quoting });
        }
        inWord = true;
    };

    const endWord = () => {
        if (inWord) {
            tokens.push({ type: 'word', word });
        }
        word = [];
        inWord = false;
    };

    while (i < input.length) {
        const ch = input[i];

        if (ch === ' ' || ch === '\t' || ch === '\n') {
            endWord();
            i++;
            continue;
        }

        if (ch === '#' && !inWord) {
            break;
        }

        // '2>' only counts as an operator at the start of a word.
        const op = operators.find(o => input.startsWith(o, i) && (!o.startsWith('2') || !inWord));
        if (op) {
            endWord();
            tokens.push({ type: 'op', op });
            i += op.length;
            continue;
        }

        if (ch === '\\') {
            if (i + 1 < input.length) {
                pushText(input[i + 1], 'single');
            }
            i += 2;
            continue;
        }

        if (ch === "'") {
            const end = input.indexOf("'", i + 1);
            if (end === -1) {
                throw new ParseError('unexpected end of input: unterminated quote');
            }
            pushText(input.slice(i + 1, end), 'single');
            i = end + 1;
            continue;
        }

        if (ch === '"') {
            i++;
            let text = '';
            while (i < input.length && input[i] !== '"') {
                // Inside double quotes a backslash only escapes these characters.
                if (input[i] === '\\' && '"\\$`'.includes(input[i + 1])) {
                    // Keep escaped '$' from being expanded by marking it as single-quoted.
                    if (text) {
                        pushText(text, 'double');
                        text = '';
                    }
                    pushText(input[i + 1], 'single');
                    i += 2;
                    continue;
                }
                text += input[i++];
            }
            if (i >= input.length) {
                throw new ParseError('unexpected end of input: unterminated quote');
            }
            pushText(text, 'double');
            i++;
            continue;
        }

        pushText(ch, 'none');
        i++;
    }
    endWord();
    return tokens;
}

export function parse(input: string): ListItem[] {
    const tokens = tokenize(input);
    const list: ListItem[] = [];
    let pos = 0;

    const unexpected = (token?: Token): never => {
        const text = !token ? 'newline' : token.type === 'op' ? token.op : token.word.map(p => p.text).join('');
        throw new ParseError(`syntax error near unexpected token \`${text}'`);
    };

    const parseCommand = (): SimpleCommand => {
        const command: SimpleCommand = { words: [], redirects: [] };
        while (pos < tokens.length) {
            const token = tokens[pos];
            if (token.type === 'word') {
                command.words.push(token.word);
                pos++;
            } else if (token.op === '2>&1') {
                command.redirects.push({ op: '2>&1', target: [] });
                pos++;
            } else if (['>', '>>', '<', '2>', '2>>'].includes(token.op)) {
                const target = tokens[pos + 1];
                if (!target || target.type !== 'word') {
                    unexpected(target);
                }
                command.redirects.push({ op: token.op as RedirectOp, target: (target as { word: Word }).word });
                pos += 2;
            } else {
                break;
            }
        }
        if (command.words.length === 0 && command.redirects.length === 0) {
            unexpected(tokens[pos]);
        }
        return command;
    };

    const parsePipeline = (): Pipeline => {
        const pipeline = [parseCommand()];
        while (pos < tokens.length) {
            const token = tokens[pos];
            if (token.type !== 'op' || token.op !== '|') {
                break;
            }
            pos++;
            pipeline.push(parseCommand());
        }
        return pipeline;
    };

    let connector: Connector = ';';
    while (pos < tokens.length) {
        list.push({ connector, pipeline: parsePipeline() });
        const token = tokens[pos];
        if (!token) {
            break;
        }
        if (token.type !== 'op' || !(token.op === ';' || token.op === '&&' || token.op === '||')) {
            unexpected(token);
        }
        connector = (token as { op: Connector }).op;
        pos++;
        if (pos >= tokens.length && connector !== ';') {
            unexpected();
        }
    }
    return list;
}
