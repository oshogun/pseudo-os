import Command, { CommandContext } from '../command';
import Directory from '../fs/directory';
import File from '../fs/file';
import { parseOptions } from '../shell/options';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(time: number): string {
    const d = new Date(time);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${months[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

class LsCommand extends Command {
    description = 'list directory contents';
    usage = '[-a] [-l] [-1] [path...]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'al1');
        const paths = operands.length ? operands : ['.'];
        const sections: string[] = [];

        const status = this.forEach(ctx, 'ls', paths, path => {
            const node = ctx.fs.get(path);
            let entries: [string, File][];
            if (node instanceof Directory) {
                entries = node.list()
                    .filter(name => flags.has('a') || !name.startsWith('.'))
                    .map(name => [name, node.getFile(name)!]);
            } else {
                entries = [[path, node]];
            }
            let text: string;
            if (flags.has('l')) {
                text = entries.map(([name, file]) => {
                    const mode = file instanceof Directory ? 'drwxr-xr-x' : '-rw-r--r--';
                    return `${mode} ${String(file.size).padStart(6)} ${formatDate(file.modified)} ${name}`;
                }).join('\n');
            } else {
                const names = entries.map(([name, file]) => ctx.interactive && file instanceof Directory ? name + '/' : name);
                text = names.join(ctx.interactive && !flags.has('1') ? '  ' : '\n');
            }
            const header = paths.length > 1 && node instanceof Directory ? `${path}:\n` : '';
            sections.push(header + text);
        });

        const output = sections.filter(s => s !== '').join(paths.length > 1 ? '\n\n' : '\n');
        if (output) {
            ctx.stdout.writeln(output);
        }
        return status;
    }
}

export default LsCommand;
