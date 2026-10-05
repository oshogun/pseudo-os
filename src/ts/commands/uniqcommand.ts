import Command, { CommandContext, lines } from "../command";
import { parseOptions } from "../shell/options";

class UniqCommand extends Command {
    description = 'collapse adjacent duplicate lines';
    usage = '[-c] [file]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'c');
        return this.readInputs(ctx, 'uniq', operands.slice(0, 1), text => {
            const groups: [string, number][] = [];
            for (const line of lines(text)) {
                const last = groups[groups.length - 1];
                if (last && last[0] === line) {
                    last[1]++;
                } else {
                    groups.push([line, 1]);
                }
            }
            for (const [line, count] of groups) {
                ctx.stdout.writeln(flags.has('c') ? `${String(count).padStart(7)} ${line}` : line);
            }
        });
    }
}

export default UniqCommand;
