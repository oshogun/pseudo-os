import Command, { CommandContext } from "../command";
import { parseOptions } from "../shell/options";

class TeeCommand extends Command {
    description = 'copy stdin to stdout and to files';
    usage = '[-a] <file>...';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'a');
        ctx.stdout.write(ctx.stdin);
        return this.forEach(ctx, 'tee', operands, file => {
            if (flags.has('a')) {
                ctx.fs.appendFile(file, ctx.stdin);
            } else {
                ctx.fs.writeFile(file, ctx.stdin);
            }
        });
    }
}

export default TeeCommand;
