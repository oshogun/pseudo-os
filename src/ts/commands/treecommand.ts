import Command, { CommandContext } from "../command";
import Directory from "../fs/directory";
import { parseOptions } from "../shell/options";

class TreeCommand extends Command {
    description = 'show a directory tree';
    usage = '[-a] [directory]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'a');
        const path = operands[0] ?? '.';
        const root = ctx.fs.getDirectory(path);
        let dirs = 0;
        let files = 0;

        const walk = (dir: Directory, indent: string) => {
            const names = dir.list().filter(name => flags.has('a') || !name.startsWith('.'));
            names.forEach((name, index) => {
                const last = index === names.length - 1;
                const node = dir.getFile(name)!;
                ctx.stdout.writeln(`${indent}${last ? '└── ' : '├── '}${name}${node instanceof Directory && ctx.interactive ? '/' : ''}`);
                if (node instanceof Directory) {
                    dirs++;
                    walk(node, indent + (last ? '    ' : '│   '));
                } else {
                    files++;
                }
            });
        };

        ctx.stdout.writeln(path);
        walk(root, '');
        ctx.stdout.writeln(`\n${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`);
        return 0;
    }
}

export default TreeCommand;
