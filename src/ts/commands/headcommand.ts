import Command, { CommandContext, lines, unlines } from "../command";
import { parseOptions, UsageError } from "../shell/options";

// Shared implementation of head and tail.
class HeadCommand extends Command {
    readonly description: string;
    usage = '[-n count] [file...]';
    private name: string;
    private fromEnd: boolean;

    constructor(fromEnd = false) {
        super();
        this.fromEnd = fromEnd;
        this.name = fromEnd ? 'tail' : 'head';
        this.description = fromEnd ? 'print the last lines of input' : 'print the first lines of input';
    }

    run = (ctx: CommandContext): number => {
        const { values, operands } = parseOptions(ctx.args, '', 'n');
        const count = Number(values.get('n') ?? 10);
        if (!Number.isInteger(count) || count < 0) {
            throw new UsageError(`invalid number of lines: '${values.get('n')}'`);
        }
        return this.readInputs(ctx, this.name, operands, (text, file) => {
            if (operands.length > 1) {
                ctx.stdout.writeln(`==> ${file} <==`);
            }
            const all = lines(text);
            const selected = this.fromEnd ? all.slice(Math.max(all.length - count, 0)) : all.slice(0, count);
            ctx.stdout.write(unlines(selected));
        });
    }
}

export default HeadCommand;
