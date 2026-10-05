import { describe, expect, it } from 'vitest';
import { setup } from './helpers';

describe('commands', () => {
    it('cd is silent on success and reports errors', () => {
        const { run, shell } = setup();
        expect(run('cd documents')).toBe('');
        expect(run('cd ../notes.txt')).toBe('cd: ../notes.txt: Not a directory\n');
        expect(run('cd nowhere')).toBe('cd: nowhere: No such file or directory\n');
        expect(shell.fs.cwd).toBe('/home/user/documents');
    });

    it('cd with no argument goes home and cd - goes back', () => {
        const { run } = setup();
        run('cd /etc');
        run('cd');
        expect(run('pwd')).toBe('/home/user\n');
        expect(run('cd -')).toBe('/etc\n');
    });

    it('touch keeps existing content', () => {
        const { run } = setup();
        run('echo keep > f');
        run('touch f');
        expect(run('cat f')).toBe('keep\n');
    });

    it('mkdir refuses to overwrite and supports -p', () => {
        const { run } = setup();
        expect(run('mkdir documents')).toBe('mkdir: documents: File exists\n');
        expect(run('mkdir -p a/b/c && ls a/b')).toBe('c/\n');
    });

    it('ls lists names, hides dotfiles and supports -a', () => {
        const { run } = setup();
        run('mkdir l && cd l && touch .hidden x && mkdir d');
        expect(run('ls')).toBe('d/  x\n');
        expect(run('ls -a')).toBe('.hidden  d/  x\n');
        expect(run('ls | cat')).toBe('d\nx\n');
        expect(run('ls nope')).toBe('ls: nope: No such file or directory\n');
    });

    it('cat concatenates files and keeps going after errors', () => {
        const { run, shell } = setup();
        run('echo a > 1; echo b > 2');
        const result = shell.execute('cat 1 missing 2');
        expect(result.output).toBe('a\ncat: missing: No such file or directory\nb\n');
        expect(result.exitCode).toBe(1);
        expect(run('cat documents')).toBe('cat: documents: Is a directory\n');
    });

    it('rm needs -r for directories', () => {
        const { run, shell } = setup();
        expect(run('rm documents')).toBe('rm: documents: Is a directory\n');
        run('rm -r documents');
        expect(shell.fs.exists('documents')).toBe(false);
        expect(run('rm -f missing')).toBe('');
        expect(run('rm -rf /')).toBe("rm: refusing to remove '/'\n");
    });

    it('mv and cp move and copy', () => {
        const { run } = setup();
        run('echo x > a; mv a b; cp b c; mkdir d; cp b c d');
        expect(run('ls')).toMatch(/b {2}c {2}d\//);
        expect(run('ls d | cat')).toBe('b\nc\n');
        expect(run('cp d e')).toBe("cp: -r not specified; omitting directory 'd'\n");
        expect(run('cp -r d e && cat e/b')).toBe('x\n');
    });

    it('grep filters lines', () => {
        const { run, shell } = setup();
        run('echo apple > f; echo Banana >> f; echo cherry >> f');
        expect(run('grep an f')).toBe('Banana\n');
        expect(run('grep -i -n BAN f')).toBe('2:Banana\n');
        expect(run('grep -v a f')).toBe('cherry\n');
        expect(run('grep -c e f')).toBe('2\n');
        expect(shell.execute('grep zzz f').exitCode).toBe(1);
    });

    it('wc, head, tail, sort and uniq process text', () => {
        const { run } = setup();
        run('echo c > f; echo a >> f; echo b >> f; echo a >> f');
        expect(run('wc -l f')).toBe('4 f\n');
        expect(run('head -n 2 f')).toBe('c\na\n');
        expect(run('tail -1 f')).toBe('a\n');
        expect(run('sort f | uniq -c')).toBe('      2 a\n      1 b\n      1 c\n');
        expect(run('sort -r -u f')).toBe('c\nb\na\n');
    });

    it('tee writes to files and stdout', () => {
        const { run } = setup();
        expect(run('echo hi | tee t1 t2')).toBe('hi\n');
        expect(run('cat t1 t2')).toBe('hi\nhi\n');
    });

    it('tree draws the directory structure', () => {
        const { run } = setup();
        run('mkdir -p t/sub && touch t/a t/sub/b');
        expect(run('tree t')).toBe('t\n├── a\n└── sub/\n    └── b\n\n1 directory, 2 files\n');
    });

    it('help lists commands and shows usage', () => {
        const { run } = setup();
        expect(run('help')).toMatch(/grep +print lines matching/);
        expect(run('help mkdir')).toBe('usage: mkdir [-p] <directory>...\ncreate directories\n');
        expect(run('mkdir --help')).toBe(run('help mkdir'));
    });

    it('reports invalid options', () => {
        const { shell } = setup();
        const result = shell.execute('ls -z');
        expect(result.output).toBe("ls: invalid option -- 'z'\nusage: ls [-a] [-l] [-1] [path...]\n");
        expect(result.exitCode).toBe(2);
    });

    it('clear asks the terminal to clear', () => {
        const { shell } = setup();
        expect(shell.execute('clear').clear).toBe(true);
        expect(shell.execute('pwd').clear).toBe(false);
    });

    it('history, export, unset and env manage shell state', () => {
        const { run } = setup();
        run('export A=1 B=2');
        run('unset B');
        expect(run('env | grep "^[AB]="')).toBe('A=1\n');
        expect(run('history 2')).toBe('    3  env | grep "^[AB]="\n    4  history 2\n');
    });

    it('which finds builtins in /bin', () => {
        const { run } = setup();
        expect(run('which ls')).toBe('/bin/ls\n');
        expect(run('cat /bin/ls')).toBe('#!pseudo-os builtin: ls\n');
    });
});
