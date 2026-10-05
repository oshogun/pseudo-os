import Command, { CommandContext } from "../command";
import { parseOptions } from "../shell/options";

class HistoryCommand extends Command {
    description = 'show or clear command history';
    usage = '[-c] [count]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'c');
        const history = ctx.shell.history;
        if (flags.has('c')) {
            history.length = 0;
            return 0;
        }
        const count = operands.length ? Number(operands[0]) : history.length;
        const start = Math.max(history.length - count, 0);
        history.slice(start).forEach((line, i) => {
            ctx.stdout.writeln(`${String(start + i + 1).padStart(5)}  ${line}`);
        });
        return 0;
    }
}

export default HistoryCommand;
