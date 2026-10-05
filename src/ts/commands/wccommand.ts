import Command, { CommandContext } from "../command";
import { parseOptions } from "../shell/options";

class WcCommand extends Command {
    description = 'count lines, words and bytes';
    usage = '[-l] [-w] [-c] [file...]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'lwc');
        const all = flags.size === 0;
        const totals = [0, 0, 0];
        const rows: [number[], string][] = [];

        const status = this.readInputs(ctx, 'wc', operands, (text, file) => {
            const counts = [
                (text.match(/\n/g) ?? []).length,
                text.split(/\s+/).filter(w => w !== '').length,
                new TextEncoder().encode(text).length,
            ];
            counts.forEach((n, i) => totals[i] += n);
            rows.push([counts, file === '-' ? '' : file]);
        });
        if (rows.length > 1) {
            rows.push([totals, 'total']);
        }
        for (const [counts, name] of rows) {
            const shown = counts.filter((_, i) => all || flags.has('lwc'[i]));
            const columns = shown.map(n => String(n).padStart(rows.length > 1 || shown.length > 1 ? 7 : 0));
            ctx.stdout.writeln([...columns, name].join(' ').trimEnd());
        }
        return status;
    }
}

export default WcCommand;
