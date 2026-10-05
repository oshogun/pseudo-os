import Command, { CommandContext } from "../command";
import { FsError } from "../fs/filesystem";
import { UsageError } from "../shell/options";

class RmdirCommand extends Command {
    description = 'remove empty directories';
    usage = '<directory>...';

    run = (ctx: CommandContext): number => {
        if (ctx.args.length < 1) {
            throw new UsageError('missing operand');
        }
        return this.forEach(ctx, 'rmdir', ctx.args, dir => {
            if (!ctx.fs.isDirectory(dir)) {
                throw new FsError(ctx.fs.exists(dir) ? 'ENOTDIR' : 'ENOENT', dir);
            }
            ctx.fs.remove(dir);
        });
    }
}

export default RmdirCommand;
