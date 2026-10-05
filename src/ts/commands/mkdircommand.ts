import Command, { CommandContext } from "../command";
import { parseOptions, UsageError } from "../shell/options";

class MkdirCommand extends Command {
    description = 'create directories';
    usage = '[-p] <directory>...';

    run = (ctx: CommandContext): number => {
        const { flags, operands } = parseOptions(ctx.args, 'p');
        if (operands.length < 1) {
            throw new UsageError('missing operand');
        }
        return this.forEach(ctx, 'mkdir', operands, dir => ctx.fs.createDirectory(dir, flags.has('p')));
    }
}

export default MkdirCommand;
