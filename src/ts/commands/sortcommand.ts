import Command, { CommandContext, lines, unlines } from "../command";
import { parseOptions } from "../shell/options";

class SortCommand extends Command {
    description = 'sort lines of text';
    usage = '[-r] [-n] [-u] [file...]';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'rnu');
        let all: string[] = [];
        const status = this.readInputs(ctx, 'sort', operands, text => all.push(...lines(text)));
        all.sort(flags.has('n')
            ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)
            : (a, b) => a < b ? -1 : a > b ? 1 : 0);
        if (flags.has('r')) {
            all.reverse();
        }
        if (flags.has('u')) {
            all = all.filter((line, i) => i === 0 || line !== all[i - 1]);
        }
        ctx.stdout.write(unlines(all));
        return status;
    }
}

export default SortCommand;
