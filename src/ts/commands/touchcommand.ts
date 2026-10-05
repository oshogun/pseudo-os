import Command, { CommandContext } from "../command";
import { UsageError } from "../shell/options";

class TouchCommand extends Command {
    description = 'create empty files or update timestamps';
    usage = '<file>...';

    run = (ctx: CommandContext): number => {
        if (ctx.args.length < 1) {
            throw new UsageError('missing file operand');
        }
        return this.forEach(ctx, 'touch', ctx.args, file => ctx.fs.createFile(file));
    }
}

export default TouchCommand;
