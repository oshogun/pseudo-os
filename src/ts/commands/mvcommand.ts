import Command, { CommandContext } from "../command";
import { FsError } from "../fs/filesystem";
import { UsageError } from "../shell/options";

class MvCommand extends Command {
    description = 'move or rename files';
    usage = '<source>... <destination>';

    run = (ctx: CommandContext): number => {
        if (ctx.args.length < 2) {
            throw new UsageError('missing file operand');
        }
        const sources = ctx.args.slice(0, -1);
        const destination = ctx.args[ctx.args.length - 1];
        if (sources.length > 1 && !ctx.fs.isDirectory(destination)) {
            throw new FsError('ENOTDIR', destination);
        }
        return this.forEach(ctx, 'mv', sources, source => ctx.fs.move(source, destination));
    }
}

export default MvCommand;
