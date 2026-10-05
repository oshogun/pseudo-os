import { describe, expect, it } from 'vitest';
import { parse, ParseError } from '../src/ts/shell/parser';

const words = (line: string) => parse(line)[0].pipeline[0].words.map(w => w.map(p => p.text).join(''));

describe('parser', () => {
    it('splits words and keeps quoted strings together', () => {
        expect(words('echo  "a b"  \'c d\' e\\ f')).toEqual(['echo', 'a b', 'c d', 'e f']);
    });

    it('handles escaped quotes inside double quotes', () => {
        expect(words('echo "say \\"hi\\""')).toEqual(['echo', 'say "hi"']);
    });

    it('does not treat quoted operators as operators', () => {
        const list = parse('echo "a > b | c"');
        expect(list[0].pipeline).toHaveLength(1);
        expect(list[0].pipeline[0].redirects).toHaveLength(0);
    });

    it('parses pipelines, redirects and connectors', () => {
        const list = parse('cat a | grep x > out; ls && pwd || echo no');
        expect(list.map(i => i.connector)).toEqual([';', ';', '&&', '||']);
        expect(list[0].pipeline).toHaveLength(2);
        expect(list[0].pipeline[1].redirects[0].op).toBe('>');
    });

    it('ignores comments', () => {
        expect(words('echo hi # not this')).toEqual(['echo', 'hi']);
    });

    it('rejects bad syntax', () => {
        expect(() => parse('| ls')).toThrow(ParseError);
        expect(() => parse('ls >')).toThrow(ParseError);
        expect(() => parse('ls &&')).toThrow(ParseError);
        expect(() => parse('echo "open')).toThrow(/unterminated/);
    });
});
